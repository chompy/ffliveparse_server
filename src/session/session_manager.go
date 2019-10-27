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

package session

import (
	"fmt"
	"net"
	"time"

	"github.com/olebedev/emitter"

	"../app"
	"../data"
)

// UserSession - data pertaining to a user's session
type UserSession struct {
	Session          data.Session
	User             data.User
	EncounterManager EncounterManager
	StartTime        time.Time
}

// Manager - session manager
type Manager struct {
	sessions          []*UserSession
	log               app.Logging
	events            *emitter.Emitter
	Database          *DatabaseHandler
	UserManager       UserManager
	logLinesProcessed int64
}

// NewSessionManager - create new session manager
func NewSessionManager(dbHandler *DatabaseHandler, events *emitter.Emitter) (Manager, error) {
	return Manager{
		Database:          dbHandler,
		sessions:          make([]*UserSession, 0),
		log:               app.Logging{ModuleName: "SESSION"},
		UserManager:       NewUserManager(dbHandler),
		events:            events,
		logLinesProcessed: 0,
	}, nil
}

// getSessionWithAddress - get session data with net address
func (m *Manager) getSessionWithAddress(addr *net.UDPAddr) *UserSession {
	for index := range m.sessions {
		if m.sessions[index].Session.IP.Equal(addr.IP) && m.sessions[index].Session.Port == addr.Port {
			return m.sessions[index]
		}
	}
	return nil
}

// GetSessionWithUser - get session data with user web id
func (m *Manager) GetSessionWithUser(user data.User) *UserSession {
	for index := range m.sessions {
		if m.sessions[index].User.ID == user.ID {
			return m.sessions[index]
		}
	}
	return nil
}

// Update - update a user's session from incomming ACT data
func (m *Manager) Update(dataStr []byte, addr *net.UDPAddr) {
	// load existing session
	session := m.getSessionWithAddress(addr)
	switch dataStr[0] {
	// handle incoming act session data
	case data.DataTypeSession:
		{
			// decode session data string
			actSessionData := data.Session{}
			err := actSessionData.FromBytes(dataStr)
			if err != nil {
				m.log.Error(err)
				return
			}
			actSessionData.SetAddress(addr)
			// session data not currently loaded for user, load it
			if session == nil {
				// ensure upload key is present
				user, err := m.UserManager.LoadFromUploadKey(actSessionData.UploadKey)
				if err != nil {
					m.log.Error(err)
					return
				}
				// check for existing data
				for index := range m.sessions {
					if m.sessions[index].User.ID == user.ID {
						m.sessions[index].Session = actSessionData
						m.log.Log(fmt.Sprintf("Updated session for user '%d' from '%s.'", m.sessions[index].User.ID, addr))
						return
					}
				}
				// create new data
				session := &UserSession{
					User:             user,
					Session:          actSessionData,
					EncounterManager: NewEncounterManager(m.Database, user),
				}
				m.sessions = append(
					m.sessions,
					session,
				)
				// start ticks
				go m.handdleSession(session)
				// save user data, update accessed time
				m.UserManager.Save(&user)
				m.log.Log(fmt.Sprintf("Created session for user '%d' from '%s.'", user.ID, addr))
				// emit act active event
				activeFlag := data.Flag{Name: "active", Value: true}
				activeFlagBytes, err := data.CompressBytes(activeFlag.ToBytes())
				if err != nil {
					m.log.Error(err)
					return
				}
				go m.events.Emit(
					"act:active",
					user.ID,
					activeFlagBytes,
				)
				break
			}
			break
		}
	// handle incoming encounter data
	case data.DataTypeEncounter:
		{
			// user session required
			if session == nil {
				return
			}
			// parse encounter data
			encounter := data.Encounter{}
			err := encounter.FromActBytes(dataStr)
			if err != nil {
				m.log.Error(err)
				return
			}
			// update encounter
			session.EncounterManager.Update(encounter)
			break
		}
	// handle incoming combatant data
	case data.DataTypeCombatant:
		{
			// user session required
			if session == nil {
				return
			}
			// parse combatant data
			combatant := data.Combatant{}
			err := combatant.FromActBytes(dataStr)
			if err != nil {
				m.log.Error(err)
				return
			}
			// update combatants
			session.EncounterManager.CombatantManager.Update(combatant)
		}
	// handle incoming log line data
	case data.DataTypeLogLine:
		{
			// user session required
			if session == nil {
				return
			}
			// parse log line data
			logLine := data.LogLine{}
			err := logLine.FromActBytes(dataStr)
			if err != nil {
				m.log.Error(err)
				return
			}
			// add to log line manager
			session.EncounterManager.LogLineManager.Update(logLine)
			// parse log line
			parsedLogLine, err := ParseLogLine(logLine)
			if err != nil {
				m.log.Error(err)
				return
			}
			// add to encounter/combatant managers
			session.EncounterManager.ReadLogLine(&parsedLogLine)
			m.logLinesProcessed++
		}
	// handle incoming flag data
	case data.DataTypeFlag:
		{
			// user session required
			if session == nil {
				return
			}
			flag := data.Flag{}
			err := flag.FromActBytes(dataStr)
			if err != nil {
				m.log.Error(err)
				return
			}
			m.log.Log(fmt.Sprintf("Flag '%s' set to '%t' for user '%d.'", flag.Name, flag.Value, session.User.ID))
			switch flag.Name {
			case "NoSave":
				{
					session.EncounterManager.NoSave = flag.Value
					break
				}
			}
			break
		}
	}

}

// handdleSession - track and send data to web users
func (m *Manager) handdleSession(session *UserSession) {
	logger := app.Logging{ModuleName: fmt.Sprintf("SESSION/%d", session.User.ID)}
	logger.Log("Start session.")
	lastActivity := time.Now()
	encounterActive := false
	encounterEndWait := false
	encounterZone := ""
	lastCombatantUpdate := time.Time{}
	lastEncounterSend := time.Time{}
	for range time.Tick(time.Millisecond * app.TickRate) {
		var err error
		// tick encounter
		session.EncounterManager.Tick()
		// send encounter
		encounter := session.EncounterManager.GetEncounter()
		encounter.UserID = session.User.ID
		if lastEncounterSend.Add(time.Millisecond*app.EncounterResendRate).Before(time.Now()) ||
			encounter.Active != encounterActive || (encounter.Zone != "" && encounterZone == "") || encounter.EndWait != encounterEndWait {
			encounterZone = encounter.Zone
			encounterActive = encounter.Active
			encounterEndWait = encounter.EndWait
			lastEncounterSend = time.Now()
			encounterBytes := encounter.ToBytes()
			encounterBytes, err = data.CompressBytes(encounterBytes)
			if err != nil {
				continue
			}
			go m.events.Emit(
				"act:encounter",
				session.User.ID,
				encounterBytes,
			)
		}
		encounterActive = encounter.Active
		// send combatants
		if session.EncounterManager.CombatantManager.GetLastUpdate().After(lastCombatantUpdate) {
			combatantBytes := make([]byte, 0)
			combatants := session.EncounterManager.CombatantManager.GetLastCombatantsSince(lastCombatantUpdate)
			for index := range combatants {
				combatants[index].UserID = session.User.ID
				combatantBytes = append(combatantBytes, combatants[index].ToBytes()...)
			}
			if len(combatantBytes) > 0 {
				lastActivity = time.Now()
				combatantBytes, err = data.CompressBytes(combatantBytes)
				if err != nil {
					continue
				}
				go m.events.Emit(
					"act:combatant",
					session.User.ID,
					combatantBytes,
				)
			}
			lastCombatantUpdate = session.EncounterManager.CombatantManager.GetLastUpdate()
		}
		// dump+send log lines
		logLineBytes := make([]byte, 0)
		logLines, err := session.EncounterManager.LogLineManager.Dump()
		if err != nil {
			m.log.Error(err)
			continue
		}
		for index := range logLines {
			logLineBytes = append(logLineBytes, logLines[index].ToBytes()...)
		}
		if len(logLines) > 0 {
			lastActivity = time.Now()
			logLineBytes, err = data.CompressBytes(logLineBytes)
			if err != nil {
				continue
			}
			go m.events.Emit(
				"act:logline",
				session.User.ID,
				logLineBytes,
			)
		}
		// check last activity time
		if lastActivity.Add(time.Millisecond * app.LastUpdateInactiveTime).Before(time.Now()) {
			break
		}
	}
	// delete session from list
	for index := range m.sessions {
		if session.User.ID == m.sessions[index].User.ID {
			m.sessions = append(m.sessions[:index], m.sessions[index+1:]...)
			break
		}
	}
	logger.Log("End session.")
}

// SessionCount - get number of active sessions
func (m *Manager) SessionCount() int {
	return len(m.sessions)
}

// GetEmptyUserSession - get new empty session, used to load previous encounters
func (m *Manager) GetEmptyUserSession(user data.User) UserSession {
	return UserSession{
		User:             user,
		EncounterManager: NewEncounterManager(m.Database, user),
	}
}

// SnapshotListener - listen for snapshot event
func (m *Manager) SnapshotListener() {
	for {
		for event := range m.events.On("stat:snapshot") {
			statSnapshot := event.Args[0].(*app.StatSnapshot)
			for index := range m.sessions {
				statSnapshot.Connections.ACT[m.sessions[index].User.ID] = 1
			}
			statSnapshot.LogLines = m.logLinesProcessed
		}
	}
}
