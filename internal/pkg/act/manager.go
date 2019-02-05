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
	"log"
	"net"
	"time"

	"github.com/olebedev/emitter"

	"../app"
	"../user"
)

// Manager - manage all act data sessions
type Manager struct {
	data        []Data
	events      *emitter.Emitter
	userManager *user.Manager
	devMode     bool
}

// NewManager - create new act manager
func NewManager(events *emitter.Emitter, userManager *user.Manager, devMode bool) Manager {
	return Manager{
		data:        make([]Data, 0),
		events:      events,
		userManager: userManager,
		devMode:     devMode,
	}
}

// ParseDataString - parse incoming act, store it in a data object
func (m *Manager) ParseDataString(dataStr []byte, addr *net.UDPAddr) (*Data, error) {
	dataObj := m.GetDataWithAddr(addr)
	switch dataStr[0] {
	case DataTypeSession:
		{
			// decode session string
			session, _, err := DecodeSessionBytes(dataStr, addr)
			if err != nil {
				return nil, err
			}
			// act data not currently loaded for user, load it
			if dataObj == nil {
				// ensure upload key is present
				user, err := m.userManager.LoadFromUploadKey(session.UploadKey)
				if err != nil {
					return nil, err
				}
				// check for existing data
				for index, existingData := range m.data {
					if existingData.User.ID == user.ID {
						m.data[index].Session = session
						log.Println("Updated ACT session for user", existingData.User.ID, "from", addr, "(LoadedDataCount:", len(m.data), ")")
						return &m.data[index], nil
					}
				}
				// create new data
				actData, err := NewData(session, user)
				if err != nil {
					return nil, err
				}
				m.data = append(
					m.data,
					actData,
				)
				// start ticks
				go m.doTick(actData.User.ID)
				go m.doLogTick(actData.User.ID)
				// save user data, update accessed time
				m.userManager.Save(user)
				log.Println("Loaded ACT session for use ", user.ID, "from", addr, "(LoadedDataCount:", len(m.data), ")")
				// emit act active event
				activeFlag := Flag{Name: "active", Value: true}
				activeFlagBytes, err := CompressBytes(EncodeFlagBytes(&activeFlag))
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
			m.userManager.Save(dataObj.User)
			// update existing data
			dataObj.Session = session
			log.Println("Updated ACT session for user", dataObj.User.ID, "from", addr, "(LoadedDataCount:", len(m.data), ")")
			break
		}
	case DataTypeEncounter:
		{
			// data required
			if dataObj == nil {
				return nil, errors.New("recieved Encounter with no matching data object")
			}
			// parse encounter data
			encounter, _, err := DecodeEncounterBytes(dataStr)
			if err != nil {
				return nil, err
			}
			// update data
			dataObj.UpdateEncounter(encounter)
			// log
			/*dur := encounter.EndTime.Sub(encounter.StartTime)
			log.Println(
				"Update encounter",
				encounter.UID,
				"for user",
				dataObj.User.ID,
				"(ZoneName:",
				encounter.Zone,
				", Damage: ",
				encounter.Damage,
				", Duration:",
				dur,
				", Active:",
				encounter.Active,
				", SuccessLevel:",
				encounter.SuccessLevel,
				")",
			)*/
			break
		}
	case DataTypeCombatant:
		{
			// data required
			if dataObj == nil {
				return nil, errors.New("recieved Combatant with no matching data object")
			}
			// parse combatant data
			combatant, _, err := DecodeCombatantBytes(dataStr)
			if err != nil {
				return nil, err
			}
			// update user data
			dataObj.UpdateCombatant(combatant)
			// log
			/*log.Println(
				"Update combatant",
				combatant.Name,
				"for encounter",
				combatant.UID,
				"(UserID:",
				dataObj.User.ID,
				", Job:",
				combatant.Job,
				", Damage:",
				combatant.Damage,
				", Healing:",
				combatant.DamageHealed,
				", DamageTaken:",
				combatant.DamageTaken,
				", Deaths:",
				combatant.Deaths,
				")",
			)*/
		}
	case DataTypeLogLine:
		{
			// data required
			if dataObj == nil {
				return nil, errors.New("recieved LogLine with no matching data object")
			}
			// parse log line data
			logLine, _, err := DecodeLogLineBytes(dataStr)
			if err != nil {
				return nil, err
			}
			// add log line
			dataObj.UpdateLogLine(logLine)
		}
	default:
		{
			return nil, errors.New("recieved unknown data")
		}
	}
	return dataObj, nil
}

// doTick - ticks every app.TickRate milliseconds
func (m *Manager) doTick(userID int64) {
	for range time.Tick(app.TickRate * time.Millisecond) {
		data := m.GetDataWithUserID(userID)
		if data == nil {
			log.Println("Tick with no session data, killing thread.")
			return
		}
		// clear session if no longer active
		if !data.IsActive() {
			m.ClearData(data)
			return
		}
		if data.Encounter.UID == "" {
			continue
		}
		if !data.NewTickData {
			continue
		}
		data.NewTickData = false
		log.Println("Tick for user", data.User.ID, "send data for encounter", data.Encounter.UID)
		// gz compress encounter data and emit event
		compressData, err := CompressBytes(EncodeEncounterBytes(&data.Encounter))
		if err != nil {
			log.Println("Error while compressing encounter data,", err)
			continue
		}
		go m.events.Emit(
			"act:encounter",
			data.User.ID,
			compressData,
		)
		// emit combatant events
		sendBytes := make([]byte, 0)
		for _, combatant := range data.Combatants {
			sendBytes = append(sendBytes, EncodeCombatantBytes(&combatant)...)
		}
		if len(sendBytes) > 0 {
			compressData, err := CompressBytes(sendBytes)
			if err != nil {
				log.Println("Error while compressing combatant data,", err)
				continue
			}
			go m.events.Emit(
				"act:combatant",
				data.User.ID,
				compressData,
			)
		}
	}
}

// doLogTick - ticks every app.LogTickRate milliseconds
func (m *Manager) doLogTick(userID int64) {
	for range time.Tick(app.LogTickRate * time.Millisecond) {
		data := m.GetDataWithUserID(userID)
		if data == nil {
			log.Println("Log tick with no session data, killing thread.")
			return
		}
		if len(data.LogLines) == 0 || data.LastLogLineIndex >= len(data.LogLines)-1 {
			continue
		}
		// emit log line events
		sendBytes := make([]byte, 0)
		for i := data.LastLogLineIndex; i < len(data.LogLines); i++ {
			sendBytes = append(sendBytes, EncodeLogLineBytes(&data.LogLines[i])...)
		}
		if len(sendBytes) > 0 {
			compressData, err := CompressBytes(sendBytes)
			if err != nil {
				log.Println("Error while compressing log line data,", err)
				continue
			}
			go m.events.Emit(
				"act:logLine",
				data.User.ID,
				compressData,
			)
		}
		// update last log line index
		data.LastLogLineIndex = len(data.LogLines) - 1
	}
}

// GetDataWithAddr - retrieve data with UDP address
func (m *Manager) GetDataWithAddr(addr *net.UDPAddr) *Data {
	for index, data := range m.data {
		if data.Session.IP.Equal(addr.IP) && data.Session.Port == addr.Port {
			return &m.data[index]
		}
	}
	return nil
}

// GetLastDataWithIP - retrieve last available data object with given ip address
func (m *Manager) GetLastDataWithIP(ip string) *Data {
	var lastData *Data
	for index, data := range m.data {
		if data.Session.IP.String() == ip {
			lastData = &m.data[index]
		}
	}
	return lastData
}

// GetDataWithUserID - retrieve data object from user ID
func (m *Manager) GetDataWithUserID(userID int64) *Data {
	for index, data := range m.data {
		if data.User.ID == userID {
			return &m.data[index]
		}
	}
	return nil
}

// GetDataWithWebID - retrieve data with web id string
func (m *Manager) GetDataWithWebID(webID string) (*Data, error) {
	userID, err := user.GetIDFromWebIDString(webID)
	if err != nil {
		return nil, err
	}
	return m.GetDataWithUserID(userID), nil
}

// ClearData - remove data from memory
func (m *Manager) ClearData(d *Data) {
	for index, data := range m.data {
		if data.User.ID == d.User.ID {
			m.data = append(m.data[:index], m.data[index+1:]...)
			if d.Encounter.ActID != 0 {
				d.SaveEncounter()
				d.ClearEncounter()
			}
			log.Println("Remove ACT session for user", d.User.ID, "(LoadedDataCount:", len(m.data), ")")
			break
		}
	}
}

// DataCount - get number of data objects
func (m *Manager) DataCount() int {
	return len(m.data)
}
