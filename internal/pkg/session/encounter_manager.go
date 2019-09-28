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

// combatantTimeout - Time before last combat action before a combatant should be considered defeated/removed
const combatantTimeout = 7500

// teamDeadTimeout - time before an encounter should end upon a team wipe
const teamDeadTimeout = 10000

type combatantTracker struct {
	Name        string
	Team        uint8
	IsAlive     bool
	WasAttacked bool
}

// EncounterManager - handles encounter and related objects
type EncounterManager struct {
	encounter        data.Encounter
	combatantManager CombatantManager
	combatantTracker []combatantTracker
	playerTeam       uint8
	log              app.Logging
}

// NewEncounterManager - create new encounter manager
func NewEncounterManager() EncounterManager {
	e := EncounterManager{
		combatantManager: NewCombatantManager(),
		log:              app.Logging{ModuleName: "ENCOUNTER"},
	}
	e.Reset()
	return e
}

// Reset - reset encounter manager
func (e *EncounterManager) Reset() {
	e.combatantManager.Reset()
	encounterUIDGenerator := xid.New()
	e.encounter = data.Encounter{
		Active:       false,
		StartTime:    time.Now(),
		EndTime:      time.Now(),
		UID:          encounterUIDGenerator.String(),
		Zone:         "",
		SuccessLevel: 2,
		Damage:       0,
	}
	e.combatantTracker = make([]combatantTracker, 0)
	e.log.ModuleName = "ENCOUNTER/" + e.encounter.UID
}

// Update - update the encounter
func (e *EncounterManager) Update(encounter data.Encounter) error {
	// reset encounter if new data is active while old data is not
	if !e.encounter.Active && encounter.Active {
		e.Reset()
		e.encounter.Active = true
	}
	// if both old+new data are inactive do nothing
	if !e.encounter.Active && !encounter.Active {
		return nil
	}
	// end if zone isn't the same
	if encounter.Active && encounter.Zone != "" && e.encounter.Zone != encounter.Zone {
		e.Reset()
		e.encounter.Active = true
	}
	// update
	if encounter.StartTime.Before(e.encounter.StartTime) {
		e.encounter.StartTime = encounter.StartTime
	}
	e.encounter.Damage = encounter.Damage
	e.encounter.Zone = encounter.Zone
	e.encounter.ActID = encounter.ActID
	return nil
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
	switch successLevel {
	case EncounterSuccessClear:
		{
			e.log.Finish(fmt.Sprintf("Encounter '%s' CLEAR.", e.encounter.UID))
		}
	case EncounterSuccessWipe, 3:
		{
			e.log.Finish(fmt.Sprintf("Encounter '%s' WIPE.", e.encounter.UID))
		}
	default:
		{
			e.log.Finish(fmt.Sprintf("Encounter '%s' ENDED.", e.encounter.UID))
		}
	}
}

// getCombatantTracker - get combatant tracker for combatant with given name
func (e *EncounterManager) getCombatantTracker(name string) *combatantTracker {
	name = strings.TrimSpace(strings.ToUpper(name))
	for index := range e.combatantTracker {
		if e.combatantTracker[index].Name == name {
			return &e.combatantTracker[index]
		}
	}
	ct := combatantTracker{
		Name:    name,
		Team:    0,
		IsAlive: true,
	}
	e.combatantTracker = append(e.combatantTracker, ct)
	return &e.combatantTracker[len(e.combatantTracker)-1]
}

// ReadLogLine - parse log line and determine encounter status
func (e *EncounterManager) ReadLogLine(l *ParsedLogLine) {
	// log line occured before last action, ignore (likely due to UDP packet ordering)
	if l.Time.Before(e.encounter.EndTime) {
		return
	}
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
				e.log.Start(fmt.Sprintf("Encounter '%s' started.", e.encounter.UID))
				e.encounter.Active = true
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
			ctAttacker.IsAlive = true
			// target was attacked
			ctTarget.WasAttacked = true
			// set teams if needed
			if ctAttacker.Team == 0 && ctTarget.Team == 0 {
				ctAttacker.Team = 1
				ctTarget.Team = 2
				e.log.Log(fmt.Sprintf("Combatant '%s' is on team 1.", ctAttacker.Name))
				e.log.Log(fmt.Sprintf("Combatant '%s' is on team 2.", ctTarget.Name))
			} else if ctAttacker.Team == 0 && ctTarget.Team != 0 {
				ctAttacker.Team = 1
				if ctTarget.Team == 1 {
					ctAttacker.Team = 2
				}
				e.log.Log(fmt.Sprintf("Combatant '%s' is on team %d.", ctAttacker.Name, ctAttacker.Team))
			} else if ctAttacker.Team != 0 && ctTarget.Team == 0 {
				ctTarget.Team = 1
				if ctAttacker.Team == 1 {
					ctTarget.Team = 2
				}
				e.log.Log(fmt.Sprintf("Combatant '%s' is on team %d.", ctTarget.Name, ctTarget.Team))
			}
			break
		}
	case LogTypeDefeat:
		{
			// must be active
			if !e.encounter.Active {
				break
			}
			ctTarget := e.getCombatantTracker(l.TargetName)
			ctTarget.IsAlive = false
			e.log.Log(fmt.Sprintf("Combatant '%s' was defeated.", ctTarget.Name))
			break
		}
	case LogTypeZoneChange:
		{
			e.log.Log(fmt.Sprintf("Zone changed to '%s.'", l.TargetName))
			if e.encounter.Zone != l.TargetName {
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
						if ct.Team != 0 {
							e.playerTeam = ct.Team
							e.log.Log(fmt.Sprintf("Player team is %d.", ct.Team))
						}
					}
				}
			/*case LogMsgIDObtainItem:
				{
					// if message about tomestones is recieved then that should mean the encounter is over
					re, err := regexp.Compile("00:083e:You obtain .* Allagan tomestones of|00:083e:You cannot receive any more Allagan tomestones of .* this week")
					if err != nil {
						break
					}
					// end encounter if match
					if re.MatchString(l.Raw) && ec.Encounter.Active {
						ec.CompletionFlag = true
						ec.log.Log(fmt.Sprintf("Encounter '%s' clear flag (tomestones) detected.", ec.Encounter.UID))
					}
					break
				}
			case LogMsgIDCompletionTime:
				{
					// if message about completion time then that should mean the encounter is over
					re, err := regexp.Compile("00:0840:.* completion time: ")
					if err != nil {
						break
					}
					// end encounter if match
					if re.MatchString(l.Raw) && ec.Encounter.Active {
						ec.CompletionFlag = true
						ec.log.Log(fmt.Sprintf("Encounter '%s' clear flag (completion time) detected.", ec.Encounter.UID))
					}
					break
				}
			case LogMsgIDCastLot:
				{
					re, err := regexp.Compile("00:0839:Cast your lot|00:0839:One or more party members have yet to complete this duty|00:0839:You received a player commendation")
					if err != nil {
						break
					}
					// end encounter if match
					if re.MatchString(l.Raw) && ec.Encounter.Active {
						ec.CompletionFlag = true
						ec.log.Log(fmt.Sprintf("Encounter '%s' clear flag (cast lots) detected.", ec.Encounter.UID))
					}
					break
				}*/
			case LogMsgIDEcho:
				{
					re, err := regexp.Compile("00:0038:end")
					if err != nil {
						break
					}
					// end encounter if match
					if re.MatchString(l.Raw) && e.encounter.Active {
						e.End(EncounterSuccessEnd)
						e.log.Log(fmt.Sprintf("Encounter '%s' clear flag (end echo) detected.", e.encounter.UID))
					}
					break
				}
			case LogMsgIDCountdownStart:
				{
					re, err := regexp.Compile("00:00b9:Battle commencing in .* seconds!")
					if err != nil {
						break
					}
					if re.MatchString(l.Raw) && e.encounter.Active {
						e.End(EncounterSuccessEnd)
						e.log.Log(fmt.Sprintf("Encounter '%s' clear flag (countdown) detected.", e.encounter.UID))
					}
					break
				}
			}
		}
	}
}
