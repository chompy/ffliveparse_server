/*
This file is part of FFLiveParse.

FFLiveParse is free software: you can redistribute it and/or modify
it under the terms of the GNU General Public License as published by
the Free Software Foundation, either version 3 of the License, or
(at your option) any later version.

FFLiveParse is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
GNU General Public License for more details.

You should have received a copy of the GNU General Public License
along with FFLiveParse.  If not, see <https://www.gnu.org/licenses/>.
*/

package act

import (
	"errors"
	"fmt"
	"net"
	"time"

	"github.com/olebedev/emitter"

	"../app"
	"../data"
	"../storage"
	"../user"
)

// Manager - manage all act data sessions
type Manager struct {
	sessions    []GameSession
	events      *emitter.Emitter
	storage     *storage.Manager
	userManager *user.Manager
	devMode     bool
	log         app.Logging
}

// NewManager - create new act manager
func NewManager(events *emitter.Emitter, sm *storage.Manager, userManager *user.Manager, devMode bool) Manager {
	return Manager{
		sessions:    make([]GameSession, 0),
		events:      events,
		userManager: userManager,
		devMode:     devMode,
		storage:     sm,
		log:         app.Logging{ModuleName: "ACT"},
	}
}

// ParseDataString - parse incoming act, store it in a data object
func (m *Manager) ParseDataString(dataStr []byte, addr *net.UDPAddr) (*GameSession, error) {
	sessObj := m.GetSessionWithAddr(addr)
	switch dataStr[0] {
	case data.DataTypeSession:
		{
			// decode session data string
			sessionData := data.Session{}
			err := sessionData.FromBytes(dataStr)
			if err != nil {
				return nil, err
			}
			sessionData.SetAddress(addr)
			// act data not currently loaded for user, load it
			if sessObj == nil {
				// ensure upload key is present
				user, err := m.userManager.LoadFromUploadKey(sessionData.UploadKey)
				if err != nil {
					return nil, err
				}
				// check for existing data
				for index, existingData := range m.sessions {
					if existingData.User.ID == user.ID {
						m.sessions[index].Session = sessionData
						m.log.Log(fmt.Sprintf("Updated session for user '%d' (%s) from '%s.'", existingData.User.ID, existingData.User.GetWebIDStringNoError(), addr))
						return &m.sessions[index], nil
					}
				}
				// create new data
				gameSession, err := NewGameSession(sessionData, user, m.storage)
				if err != nil {
					return nil, err
				}
				m.sessions = append(
					m.sessions,
					gameSession,
				)
				// start ticks
				go m.doTick(gameSession.User.ID)
				// save user data, update accessed time
				m.userManager.Save(&user)
				m.log.Log(fmt.Sprintf("Created session for user '%d' (%s) from '%s.'", user.ID, user.GetWebIDStringNoError(), addr))
				// emit act active event
				activeFlag := data.Flag{Name: "active", Value: true}
				activeFlagBytes, err := data.CompressBytes(activeFlag.ToBytes())
				if err != nil {
					return nil, err
				}
				go m.events.Emit(
					"act:active",
					user.ID,
					activeFlagBytes,
				)
				break
			}
			// save user data, update accessed time
			m.userManager.Save(&sessObj.User)
			// update existing data
			sessObj.Session = sessionData
			m.log.Log(fmt.Sprintf("Updated session for user '%d' (%s) from '%s.'", sessObj.User.ID, sessObj.User.GetWebIDStringNoError(), addr))
			break
		}
	case data.DataTypeEncounter:
		{
			// data required
			if sessObj == nil {
				return nil, errors.New("recieved Encounter with no matching data object")
			}
			// parse encounter data
			encounter := data.Encounter{}
			err := encounter.FromActBytes(dataStr)
			if err != nil {
				return nil, err
			}
			// update data
			sessObj.UpdateEncounter(encounter)
			break
		}
	case data.DataTypeCombatant:
		{
			// data required
			if sessObj == nil {
				return nil, errors.New("recieved Combatant with no matching data object")
			}
			// parse combatant data
			combatant := data.Combatant{}
			err := combatant.FromActBytes(dataStr)
			if err != nil {
				return nil, err
			}
			// update user data
			sessObj.UpdateCombatant(combatant)
		}
	case data.DataTypeLogLine:
		{
			// data required
			if sessObj == nil {
				return nil, errors.New("recieved LogLine with no matching data object")
			}
			// parse log line data
			logLine := data.LogLine{}
			err := logLine.FromActBytes(dataStr)
			if err != nil {
				return nil, err
			}
			// add log line
			err = sessObj.UpdateLogLine(logLine)
			if err != nil {
				return nil, err
			}
		}
	default:
		{
			return nil, errors.New("recieved unknown data")
		}
	}
	return sessObj, nil
}

// doTick - ticks every app.TickRate milliseconds
func (m *Manager) doTick(userID int64) {
	for range time.Tick(app.TickRate * time.Millisecond) {
		sessObj := m.GetSessionWithUserID(userID)
		if sessObj == nil {
			m.log.Log(fmt.Sprintf("Tick with no session data for user '%d.' Killing thread.", userID))
			return
		}
		// clear session if no longer active
		if !sessObj.IsActive() {
			m.log.Log(fmt.Sprintf("Session inactive for user '%d' (%s).", sessObj.User.ID, sessObj.User.GetWebIDStringNoError()))
			m.ClearSession(sessObj)
			return
		}
		if sessObj.EncounterCollector.Encounter.UID == "" {
			continue
		}
		var dumpData []data.ByteEncodable
		var err error
		// check if encounter should be made inactive
		if sessObj.EncounterCollector.Encounter.Active {
			sessObj.EncounterCollector.CheckInactive()
			if !sessObj.EncounterCollector.Encounter.Active {
				// dump buffer before saving encounter
				dumpData, err = sessObj.Buffer.Dump()
				if err != nil {
					m.log.Error(err)
				}
				// save encounter
				err = sessObj.SaveEncounter()
				if err != nil {
					m.log.Error(err)
				}
				sessObj.NewTickData = true
			}
		}
		// ensure there is new data to send
		if !sessObj.NewTickData {
			continue
		}
		sessObj.NewTickData = false
		// build data to send
		sendData := make([]byte, 0)
		// encounter
		sendData = append(sendData, sessObj.EncounterCollector.Encounter.ToBytes()...)
		// combatants
		for _, combatant := range sessObj.CombatantCollector.GetLatestSnapshots() {
			combatant.UserID = sessObj.User.ID
			combatant.EncounterUID = sessObj.EncounterCollector.Encounter.UID
			sendData = append(sendData, combatant.ToBytes()...)
		}
		// dump buffer
		if len(dumpData) == 0 {
			dumpData, err = sessObj.Buffer.Dump()
			if err != nil {
				m.log.Error(err)
				continue
			}
		}
		for index := range dumpData {
			sendData = append(sendData, dumpData[index].ToBytes()...)
		}
		// compress
		sendData, err = data.CompressBytes(sendData)
		if err != nil {
			m.log.Error(err)
			continue
		}
		// send
		go m.events.Emit(
			"act:tick",
			sessObj.User.ID,
			sendData,
		)
	}
}

// SnapshotListener - listen for snapshot event and update snapshot data
func (m *Manager) SnapshotListener() {
	startTime := time.Now()
	for {
		for event := range m.events.On("stat:snapshot") {
			currentTime := time.Now()
			timeDiff := int(currentTime.Sub(startTime).Minutes())
			statSnapshot := event.Args[0].(*app.StatSnapshot)
			logLineCount := 0
			for _, sess := range m.sessions {
				logLineCount += sess.LogLineCounter
				userIDString, err := sess.User.GetWebIDString()
				if err == nil {
					statSnapshot.Connections.ACT[userIDString]++
				}
			}
			if timeDiff > 0 {
				statSnapshot.LogLinesPerMinute = logLineCount / timeDiff
			}
			// TODO
			statSnapshot.TotalEncounters = 0
			statSnapshot.TotalCombatants = 0
			statSnapshot.TotalUsers = 0
		}
	}
}

// GetSessionWithAddr - retrieve session with UDP address
func (m *Manager) GetSessionWithAddr(addr *net.UDPAddr) *GameSession {
	for index, session := range m.sessions {
		if session.Session.IP.Equal(addr.IP) && session.Session.Port == addr.Port {
			return &m.sessions[index]
		}
	}
	return nil
}

// GetLastSessionWithIP - retrieve last available session object with given ip address
func (m *Manager) GetLastSessionWithIP(ip string) *GameSession {
	var lastData *GameSession
	for index, sess := range m.sessions {
		if sess.Session.IP.String() == ip {
			lastData = &m.sessions[index]
		}
	}
	return lastData
}

// GetSessionWithUserID - retrieve data object from user ID
func (m *Manager) GetSessionWithUserID(userID int64) *GameSession {
	for index, session := range m.sessions {
		if session.User.ID == userID {
			return &m.sessions[index]
		}
	}
	return nil
}

// GetSessionWithWebID - retrieve data with web id string
func (m *Manager) GetSessionWithWebID(webID string) (*GameSession, error) {
	userID, err := data.GetIDFromWebIDString(webID)
	if err != nil {
		return nil, err
	}
	return m.GetSessionWithUserID(userID), nil
}

// ClearSession - remove session from memory
func (m *Manager) ClearSession(s *GameSession) {
	for index, ittSess := range m.sessions {
		if ittSess.User.ID == s.User.ID {
			m.sessions = append(m.sessions[:index], m.sessions[index+1:]...)
			if s.EncounterCollector.Encounter.Active {
				err := s.SaveEncounter()
				if err != nil {
					m.log.Error(err)
				}
				s.ClearEncounter()
			}
			m.log.Log(fmt.Sprintf("End ACT session for user '%d' (%s).", s.User.ID, s.User.GetWebIDStringNoError()))
			break
		}
	}
}

// ClearAllSessions - clear all sessions from memory
func (m *Manager) ClearAllSessions() {
	for m.SessionCount() > 0 {
		m.ClearSession(&m.sessions[0])
	}
}

// SessionCount - get number of session objects
func (m *Manager) SessionCount() int {
	return len(m.sessions)
}
