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
	"log"
	"strings"
	"time"

	"../user"
	"github.com/rs/xid"
)

// encounterInactiveTime - Time before last combat action before encounter should go inactive
const encounterInactiveTime = 5000

// encounterCollectorCombatantTracker - Track combatants in encounter to determine active status
type encounterCollectorCombatantTracker struct {
	Name           string
	Team           uint8
	IsAlive        bool
	LastActionTime time.Time
}

// EncounterCollector - Encounter data collector
type EncounterCollector struct {
	Encounter        Encounter
	LastActionTime   time.Time
	CombatantTracker []encounterCollectorCombatantTracker
	userIDHash       string
	PlayerTeam       uint8
}

// NewEncounterCollector - Create new encounter collector
func NewEncounterCollector(user *user.Data) EncounterCollector {
	userIDHash, _ := user.GetWebIDString()
	ec := EncounterCollector{
		userIDHash: userIDHash,
		PlayerTeam: 0,
	}
	ec.Reset()
	return ec
}

// Reset - Reset encounter, start new
func (ec *EncounterCollector) Reset() {
	encounterUIDGenerator := xid.New()
	ec.Encounter = Encounter{
		Active:       false,
		StartTime:    time.Now(),
		EndTime:      time.Now(),
		UID:          encounterUIDGenerator.String(),
		Zone:         "",
		SuccessLevel: 2,
		Damage:       0, // not currently tracked
	}
	ec.CombatantTracker = make([]encounterCollectorCombatantTracker, 0)
}

// UpdateEncounter - Sync encounter data from ACT
func (ec *EncounterCollector) UpdateEncounter(encounter Encounter) {
	if !ec.Encounter.Active {
		return
	}
	if ec.Encounter.Zone == "" {
		ec.Encounter.Zone = encounter.Zone
	} else if ec.Encounter.Zone != encounter.Zone {
		ec.endEncounter()
	}
}

// getCombatantTracker - Get combatant to track
func (ec *EncounterCollector) getCombatantTracker(name string) *encounterCollectorCombatantTracker {
	name = strings.TrimSpace(strings.ToUpper(name))
	if name == "" {
		return nil
	}
	for index, ct := range ec.CombatantTracker {
		if ct.Name == name {
			return &ec.CombatantTracker[index]
		}
	}
	log.Println("[", ec.userIDHash, "][ Encounter", ec.Encounter.UID, "] New combatant", name)
	newCt := encounterCollectorCombatantTracker{
		Name:           name,
		Team:           0,
		IsAlive:        true,
		LastActionTime: time.Time{},
	}
	ec.CombatantTracker = append(ec.CombatantTracker, newCt)
	return &ec.CombatantTracker[len(ec.CombatantTracker)-1]
}

// endEncounter - Flag encounter as inactive and set end time to last action time
func (ec *EncounterCollector) endEncounter() {
	switch ec.Encounter.SuccessLevel {
	case 1:
		{
			log.Println("[", ec.userIDHash, "][ Encounter", ec.Encounter.UID, "] Clear")
		}
	case 2, 3:
		{
			log.Println("[", ec.userIDHash, "][ Encounter", ec.Encounter.UID, "] Wipe")
		}
	default:
		{
			log.Println("[", ec.userIDHash, "][ Encounter", ec.Encounter.UID, "] Ended")
		}
	}
	ec.Encounter.Active = false
	ec.Encounter.EndTime = time.Time{}
	ec.Encounter.EndTime = ec.LastActionTime
}

// ReadLogLine - Parse log line and determine encounter status
func (ec *EncounterCollector) ReadLogLine(l *LogLineData) {
	switch l.Type {
	case LogTypeSingleTarget, LogTypeAoe:
		{
			// must be damage action
			if !l.HasFlag(LogFlagDamage) {
				break
			}
			// start encounter
			if len(ec.CombatantTracker) == 0 && !ec.Encounter.Active {
				log.Println("[", ec.userIDHash, "][ Encounter", ec.Encounter.UID, "] Started")
				ec.Encounter.Active = true
				ec.Encounter.StartTime = l.Time
			}
			// update encounter end time
			if ec.Encounter.EndTime.Before(l.Time) {
				ec.Encounter.EndTime = l.Time
			}
			// gather combatant tracker data
			ctAttacker := ec.getCombatantTracker(l.AttackerName)
			if ctAttacker == nil {
				break
			}
			ctTarget := ec.getCombatantTracker(l.TargetName)
			if ctTarget == nil {
				break
			}
			// ignore log line if last action happened after this one
			if ctAttacker.LastActionTime.After(l.Time) || ctTarget.LastActionTime.After(l.Time) {
				break
			}
			// update combatant tracker data
			if !ctAttacker.IsAlive {
				ctAttacker.IsAlive = true
				log.Println("[", ec.userIDHash, "][ Encounter", ec.Encounter.UID, "] Combatant", ctAttacker.Name, "is alive")
			}
			if !ctTarget.IsAlive {
				ctTarget.IsAlive = true
				log.Println("[", ec.userIDHash, "][ Encounter", ec.Encounter.UID, "] Combatant", ctTarget.Name, "is alive")
			}
			ctAttacker.LastActionTime = l.Time
			ctTarget.LastActionTime = l.Time
			ec.LastActionTime = l.Time
			// set teams if needed
			if ctAttacker.Team == 0 && ctTarget.Team == 0 {
				ctAttacker.Team = 1
				ctTarget.Team = 2
				log.Println("[", ec.userIDHash, "][ Encounter", ec.Encounter.UID, "] Combatant", ctAttacker.Name, "is on team 1")
				log.Println("[", ec.userIDHash, "][ Encounter", ec.Encounter.UID, "] Combatant", ctTarget.Name, "is on team 2")
			} else if ctAttacker.Team == 0 && ctTarget.Team != 0 {
				ctAttacker.Team = 1
				if ctTarget.Team == 1 {
					ctAttacker.Team = 2
				}
				log.Println("[", ec.userIDHash, "][ Encounter", ec.Encounter.UID, "] Combatant", ctAttacker.Name, "is on team", ctAttacker.Team)
			} else if ctAttacker.Team != 0 && ctTarget.Team == 0 {
				ctTarget.Team = 1
				if ctAttacker.Team == 1 {
					ctTarget.Team = 2
				}
				log.Println("[", ec.userIDHash, "][ Encounter", ec.Encounter.UID, "] Combatant", ctTarget.Name, "is on team", ctTarget.Team)
			}
			break
		}
	case LogTypeDefeat, LogTypeRemoveCombatant, LogTypeHPPercent:
		{
			// must be active
			if !ec.Encounter.Active {
				return
			}
			// if hp percent then it must be 0
			if l.Type == LogTypeHPPercent && l.Damage != 0 {
				break
			}
			// get combatant tracker data
			ctTarget := ec.getCombatantTracker(l.TargetName)
			if ctTarget == nil {
				break
			}
			// ignore log line if last action happened after this one
			if ctTarget.LastActionTime.After(l.Time) {
				break
			}
			// update target
			ctTarget.LastActionTime = l.Time
			ec.LastActionTime = l.Time
			if ctTarget.IsAlive {
				ctTarget.IsAlive = false
				log.Println("[", ec.userIDHash, "][ Encounter", ec.Encounter.UID, "] Combatant", ctTarget.Name, "was defeated/removed")
			}
			break
		}
	case LogTypeZoneChange:
		{
			log.Println("[", ec.userIDHash, "] Zone changed to", l.TargetName)
			if !ec.Encounter.Active {
				return
			}
			if ec.Encounter.Zone == "" {
				ec.Encounter.Zone = l.TargetName
			} else if ec.Encounter.Zone != l.TargetName {
				ec.endEncounter()
			}
			break
		}
	case LogTypeGameLog:
		{
			if ec.PlayerTeam > 0 {
				break
			}
			if l.TargetName != "" && l.AttackerName != "" {
				playerName := strings.TrimSpace(strings.ToUpper(l.AttackerName))
				for _, ct := range ec.CombatantTracker {
					if ct.Name == playerName {
						ec.PlayerTeam = ct.Team
						break
					}
				}
			}
			break
		}
	}

}

// IsNewEncounter - Check if log data is for new encounter
func (ec *EncounterCollector) IsNewEncounter(l *LogLineData) bool {
	// already active, not a new encounter
	if ec.Encounter.Active {
		return false
	}
	// single target/aoe attack action
	if (l.Type == LogTypeSingleTarget || l.Type == LogTypeAoe) && l.HasFlag(LogFlagDamage) {
		return true
	}
	return false
}

// CheckInactive - Check if encounter should be made inactive
func (ec *EncounterCollector) CheckInactive() {
	// encounter already not active
	if !ec.Encounter.Active {
		return
	}
	// time should have passed since last combat action
	if time.Now().Add(time.Duration(-encounterInactiveTime) * time.Millisecond).Before(ec.LastActionTime) {
		return
	}
	// should be at least two combatants tracked
	combatantCount := 0
	for _, ct := range ec.CombatantTracker {
		if ct.Team != 0 {
			combatantCount++
		}
	}
	if combatantCount < 2 {
		return
	}
	// check to see if a team is dead, if so encounter should be considered inactive
	for team := 1; team <= 2; team++ {
		teamDead := true
		for _, ct := range ec.CombatantTracker {
			if ct.Team == uint8(team) && ct.IsAlive {
				teamDead = false
				break
			}
		}
		if teamDead {
			// set success level
			// clear
			ec.Encounter.SuccessLevel = 1
			if uint8(team) == ec.PlayerTeam {
				// wipe
				ec.Encounter.SuccessLevel = 2
			}
			ec.endEncounter()
			return
		}
	}
}
