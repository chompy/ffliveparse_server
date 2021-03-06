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
	"regexp"
	"strings"
	"time"

	"../app"
	"../data"
	"github.com/rs/xid"
)

// EncounterSuccessEnd - flag, encounter ended with no indication of success/failure
const EncounterSuccessEnd = 0

// EncounterSuccessClear - flag, encounter was completed
const EncounterSuccessClear = 1

// EncounterSuccessWipe - flag, encounter was failed
const EncounterSuccessWipe = 2

// teamDeadTimeout - time before an encounter should end upon a team wipe
const teamDeadTimeout = 30000

// noActionTimeout - time before an encounter should end when no actions/data have been recieved
const noActionTimeout = 300000

type combatantTracker struct {
	Name        string
	Team        uint8
	IsAlive     bool
	WasAttacked bool
}

// EncounterManager - handles encounter and related objects
type EncounterManager struct {
	encounter        data.Encounter
	combatantTracker []*combatantTracker
	playerTeam       uint8
	teamWipeTime     time.Time
	lastActionTime   time.Time
	log              app.Logging
	database         *DatabaseHandler
	User             data.User
	CombatantManager CombatantManager
	LogLineManager   LogLineManager
	NoSave           bool
}

// NewEncounterManager - create new encounter manager
func NewEncounterManager(database *DatabaseHandler, user data.User) EncounterManager {
	e := EncounterManager{
		log:              app.Logging{ModuleName: "ENCOUNTER"},
		CombatantManager: NewCombatantManager(),
		LogLineManager:   NewLogLineManager(),
		database:         database,
		User:             user,
		NoSave:           false,
	}
	e.Reset()
	return e
}

// Reset - reset encounter manager
func (e *EncounterManager) Reset() {
	encounterUIDGenerator := xid.New()
	e.encounter = data.Encounter{
		Active:       false,
		StartTime:    time.Now(),
		EndTime:      time.Now(),
		UID:          encounterUIDGenerator.String(),
		Zone:         "",
		SuccessLevel: 2,
		Damage:       0,
		UserID:       e.User.ID,
	}
	e.playerTeam = 0
	e.lastActionTime = time.Now()
	e.teamWipeTime = time.Time{}
	e.combatantTracker = make([]*combatantTracker, 0)
	e.CombatantManager.ResetEncounter(e.encounter)
	e.LogLineManager.Reset()
	e.log.ModuleName = fmt.Sprintf("ENCOUNTER/%s", e.encounter.UID)
	e.LogLineManager.SetEncounterUID(e.encounter.UID)
}

// Update - update the encounter
func (e *EncounterManager) Update(encounter data.Encounter) {
	// ignore updates if current encounter is inactive
	if !e.encounter.Active {
		return
	}
	// update zone
	if e.encounter.Zone == "" && encounter.Zone != "" {
		e.encounter.Zone = encounter.Zone
	}
	// set current act id (could change throughout encounter depending on ACT settings)
	e.encounter.ActID = encounter.ActID
}

// Set - set encounter
func (e *EncounterManager) Set(encounter data.Encounter) {
	e.encounter = encounter
}

// End - flag encounter as inactive
func (e *EncounterManager) End(successLevel uint8) {
	// wasn't active
	if !e.encounter.Active {
		return
	}
	// flag end
	e.encounter.Active = false
	e.encounter.SuccessLevel = successLevel
	// save
	err := e.Save()
	if err != nil {
		e.log.Error(err)
	}
	// log status
	switch successLevel {
	case EncounterSuccessClear:
		{
			e.log.Log(fmt.Sprintf("Encounter '%s' CLEAR. (%s)", e.encounter.UID, e.encounter.EndTime.Sub(e.encounter.StartTime)))
		}
	case EncounterSuccessWipe, 3:
		{
			e.log.Log(fmt.Sprintf("Encounter '%s' WIPE. (%s)", e.encounter.UID, e.encounter.EndTime.Sub(e.encounter.StartTime)))
		}
	default:
		{
			e.log.Log(fmt.Sprintf("Encounter '%s' ENDED. (%s)", e.encounter.UID, e.encounter.EndTime.Sub(e.encounter.StartTime)))
		}
	}
}

// getCombatantTracker - get combatant tracker for combatant with given name
func (e *EncounterManager) getCombatantTracker(name string) *combatantTracker {
	name = strings.TrimSpace(strings.ToUpper(name))
	if name == "" {
		return nil
	}
	for index := range e.combatantTracker {
		if e.combatantTracker[index].Name == name {
			return e.combatantTracker[index]
		}
	}
	ct := &combatantTracker{
		Name:        name,
		Team:        0,
		IsAlive:     true,
		WasAttacked: false,
	}
	e.combatantTracker = append(e.combatantTracker, ct)
	return ct
}

// checkTeamStatus - check status of combatant tracker teams to determine encounter status
func (e *EncounterManager) checkTeamStatus() {
	// must have active encounter
	if !e.encounter.Active {
		return
	}
	// map alive counts on each team
	ctMap := make(map[uint8]int)
	ctMap[1] = 0
	ctMap[2] = 0
	for index := range e.combatantTracker {
		if e.combatantTracker[index].Team == 0 {
			continue
		}
		if e.combatantTracker[index].IsAlive && e.combatantTracker[index].WasAttacked {
			ctMap[e.combatantTracker[index].Team]++
		}
	}
	// if all teams alive then reset team wipe time
	deadTeam := uint8(0)
	for team := range ctMap {
		if ctMap[team] == 0 {
			deadTeam = team
			break
		}
	}
	if deadTeam == 0 {
		if e.teamWipeTime.After(time.Time{}) {
			e.log.Log("Both teams are alive.")
		}
		e.teamWipeTime = time.Time{}
		return
	}
	// set 'time wipe time'
	if e.teamWipeTime.Before(e.encounter.StartTime) {
		e.teamWipeTime = time.Now().Add(time.Millisecond * teamDeadTimeout)
		e.log.Log(fmt.Sprintf("Team %d has no remaining combatants.", deadTeam))
	}
	// 'team wipe time' has passed
	if time.Now().After(e.teamWipeTime) {
		for team := range ctMap {
			if ctMap[team] == 0 {
				if e.playerTeam == 0 {
					// player team unknown, end encounter with unknown success
					e.End(EncounterSuccessEnd)
					return
				} else if team == e.playerTeam {
					// player team wipe, end encounter with fail
					e.End(EncounterSuccessWipe)
					return
				}
				// player team still alive, end encounter with clear
				e.End(EncounterSuccessClear)
				return
			}
		}
	}
}

// ReadLogLine - parse log line and determine encounter status
func (e *EncounterManager) ReadLogLine(l *ParsedLogLine) {
	// log line occured before last action, ignore (likely due to UDP packet ordering)
	if l.Time.Before(e.encounter.EndTime) {
		return
	}
	// perform actions
	switch l.Type {
	case LogTypeSingleTarget, LogTypeAoe:
		{
			// must be damage action
			if !l.HasFlag(LogFlagDamage) {
				break
			}
			// start/reset encounter
			if !e.encounter.Active {
				e.Reset()
				e.encounter.Active = true
				e.encounter.StartTime = l.Time
			}
			// update encounter end time
			e.encounter.EndTime = l.Time
			// ignore actions where attacker is targeting self
			if l.AttackerName == l.TargetName {
				break
			}
			// gather combatant tracker data
			ctAttacker := e.getCombatantTracker(l.AttackerName)
			if ctAttacker == nil {
				break
			}
			ctTarget := e.getCombatantTracker(l.TargetName)
			if ctTarget == nil {
				break
			}
			// attacker is a alive
			if !ctAttacker.IsAlive {
				e.log.Log(fmt.Sprintf("Combatant '%s' is alive.", l.AttackerName))
				ctAttacker.IsAlive = true
			}
			// target was attacked
			if !ctTarget.WasAttacked {
				e.log.Log(fmt.Sprintf("Combatant '%s' is a valid target.", l.TargetName))
				ctTarget.WasAttacked = true
			}
			// set teams if needed
			if ctAttacker.Team == 0 && ctTarget.Team == 0 {
				ctAttacker.Team = 1
				ctTarget.Team = 2
				e.log.Log(fmt.Sprintf("Combatant '%s' is on team 1.", l.AttackerName))
				e.log.Log(fmt.Sprintf("Combatant '%s' is on team 2.", l.TargetName))
			} else if ctAttacker.Team == 0 && ctTarget.Team != 0 {
				ctAttacker.Team = 1
				if ctTarget.Team == 1 {
					ctAttacker.Team = 2
				}
				e.log.Log(fmt.Sprintf("Combatant '%s' is on team %d.", l.AttackerName, ctAttacker.Team))
			} else if ctAttacker.Team != 0 && ctTarget.Team == 0 {
				ctTarget.Team = 1
				if ctAttacker.Team == 1 {
					ctTarget.Team = 2
				}
				e.log.Log(fmt.Sprintf("Combatant '%s' is on team %d.", l.TargetName, ctTarget.Team))
			}
			// update team wipe time if action was just performed
			if e.teamWipeTime.After(e.encounter.StartTime) {
				e.teamWipeTime = time.Now().Add(time.Millisecond * teamDeadTimeout)
			}
			e.lastActionTime = time.Now()
			break
		}
	case LogTypeRemoveCombatant, LogTypeDefeat:
		{
			// must be active
			if !e.encounter.Active {
				break
			}
			ctTarget := e.getCombatantTracker(l.TargetName)
			if ctTarget == nil {
				break
			}
			if ctTarget.IsAlive {
				ctTarget.IsAlive = false
				e.log.Log(fmt.Sprintf("Combatant '%s' was defeated.", l.TargetName))
			}
			e.checkTeamStatus()
			break
		}
	case LogTypeZoneChange:
		{
			e.log.Log(fmt.Sprintf("Zone changed to '%s.'", l.TargetName))
			if e.encounter.Zone != l.TargetName {
				// if zone change while waiting for team wipe to be determined
				// then force team wipe check now
				if e.IsWaitForTeamWipe() {
					e.teamWipeTime = time.Now().Add(-time.Second)
					e.checkTeamStatus()
				}
				// otherwise flag unknown end
				e.End(EncounterSuccessEnd)
			}
			break
		}
	case LogTypeGameLog:
		{
			switch l.GameLogType {
			case LogMsgIDCharacterWorldName:
				{
					if e.playerTeam > 0 {
						break
					}
					if l.TargetName != "" && l.AttackerName != "" {
						ct := e.getCombatantTracker(l.AttackerName)
						if ct == nil {
							break
						}
						if ct.Team != 0 {
							e.playerTeam = ct.Team
							e.log.Log(fmt.Sprintf("Player team is %d.", ct.Team))
						}
					}
				}
			case LogMsgIDEcho:
				{
					re, err := regexp.Compile("00:0038:end")
					if err != nil {
						break
					}
					// end encounter if match
					if re.MatchString(l.Raw) && e.encounter.Active {
						e.End(EncounterSuccessEnd)
						e.log.Log("Clear flag (end echo) detected.")
					}
					break
				}
			case LogMsgIDCountdown[0], LogMsgIDCountdown[1], LogMsgIDCountdown[2]:
				{
					if !e.encounter.Active {
						break
					}
					e.log.Log("Clear flag (countdown) detected.")
					// if countdown while waiting for team wipe to be determined
					// then force team wipe check now
					if e.IsWaitForTeamWipe() {
						e.teamWipeTime = time.Now().Add(-time.Second)
						e.checkTeamStatus()
					}
					e.End(EncounterSuccessEnd)
					break
				}

			case LogMsgPopUpBubble:
				{
					// if 'boss' is talking then extend team wipe timeout
					if e.IsWaitForTeamWipe() {
						e.log.Log("Extend team wipe timeout.")
						e.teamWipeTime = time.Now().Add(time.Millisecond * teamDeadTimeout)
					}
					break
				}
			}
		}
	}
	// send log line to combatant manager
	// log line manager will recieve log line from session manager
	e.CombatantManager.ReadLogLine(l)
}

// Tick - perform status checks
func (e *EncounterManager) Tick() {
	e.checkTeamStatus()
	if e.encounter.Active && e.lastActionTime.Add(time.Millisecond*noActionTimeout).Before(time.Now()) {
		e.End(EncounterSuccessEnd)
	}
}

// GetEncounter - get the current encounter
func (e *EncounterManager) GetEncounter() data.Encounter {
	e.encounter.EndWait = e.IsWaitForTeamWipe()
	return e.encounter
}

// IsWaitForTeamWipe - determine if waiting for team wipe time out to end encounter
func (e *EncounterManager) IsWaitForTeamWipe() bool {
	return e.teamWipeTime.After(e.encounter.StartTime) && e.teamWipeTime.After(time.Now())
}

// Save - save encounter
func (e *EncounterManager) Save() error {
	// no database
	if e.database == nil {
		return nil
	}
	// no save enabled
	if e.NoSave {
		return nil
	}
	// ensure encounter meets min+max encounter length
	duration := e.encounter.EndTime.Sub(e.encounter.StartTime)
	if duration < app.MinEncounterSaveLength*time.Millisecond || duration > app.MaxEncounterSaveLength*time.Millisecond {
		return nil
	}
	// store encounter to database
	err := e.database.StoreEncounter(&e.encounter)
	if err != nil {
		return err
	}
	// store combatants
	combatants := e.CombatantManager.GetCombatants()
	storeCombatants := make([]*data.Combatant, 0)
	for index := range combatants {
		combatants[index].UserID = e.User.ID
		storeCombatants = append(storeCombatants, &combatants[index])
	}
	err = e.database.StoreCombatants(storeCombatants)
	if err != nil {
		return err
	}
	// store log lines
	return e.LogLineManager.Save()
}

// Load - load previous encounter
func (e *EncounterManager) Load(encounterUID string) error {
	// no database
	if e.database == nil {
		return fmt.Errorf("no database loaded")
	}
	e.LogLineManager.SetEncounterUID(encounterUID)
	// fetch encounter
	var err error
	e.encounter, err = e.database.FetchEncounter(encounterUID)
	if err != nil {
		return err
	}
	// fetch combatants
	combatants, err := e.database.FetchCombatantsForEncounter(encounterUID)
	if err != nil {
		return err
	}
	e.CombatantManager.SetCombatants(combatants)
	return nil
}
