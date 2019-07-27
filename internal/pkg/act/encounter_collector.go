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
	"fmt"
	"log"
	"regexp"
	"strings"
	"time"

	"../user"
	"github.com/rs/xid"
)

// encounterInactiveTime - Time before last combat action before encounter should go inactive
const encounterInactiveTime = 1000

// combatantTimeout - Time before last combat action before a combatant should be considered defeated/removed
const combatantTimeout = 7500

// reportDisplayIntervals - Interval at which to log encounter report
const reportDisplayIntervals = 10000

// encounterCollectorCombatantTracker - Track combatants in encounter to determine active status
type encounterCollectorCombatantTracker struct {
	Name           string
	MaxHP          int
	Team           uint8
	IsAlive        bool
	WasAttacked    bool // combatant was attacked by another
	LastActionTime time.Time
}

// EncounterCollector - Encounter data collector
type EncounterCollector struct {
	Encounter        Encounter
	LastActionTime   time.Time
	CombatantTracker []encounterCollectorCombatantTracker
	userIDHash       string
	PlayerTeam       uint8
	CurrentZone      string
	LastReportTime   time.Time
	CompletionFlag   bool
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
	ec.PlayerTeam = 0
	ec.LastReportTime = time.Now()
	ec.CompletionFlag = false
}

// UpdateEncounter - Sync encounter data from ACT
func (ec *EncounterCollector) UpdateEncounter(encounter Encounter) {
	if !ec.Encounter.Active {
		return
	}
	if ec.Encounter.Zone == "" && encounter.Zone != "" {
		if encounter.StartTime.Before(ec.Encounter.StartTime) {
			ec.Encounter.StartTime = encounter.StartTime
		}
		ec.Encounter.ActID = encounter.ActID
		ec.Encounter.Zone = encounter.Zone
		ec.CurrentZone = ec.Encounter.Zone
	}
}

// getCombatantTrackers - Get all matching tracked combatants
func (ec *EncounterCollector) getCombatantTrackers(name string, maxHP int) []*encounterCollectorCombatantTracker {
	name = strings.TrimSpace(strings.ToUpper(name))
	if name == "" {
		return nil
	}
	trackers := make([]*encounterCollectorCombatantTracker, 0)
	for index, ct := range ec.CombatantTracker {
		if ct.Name == name && (maxHP == 0 || ct.MaxHP == maxHP || ec.PlayerTeam == ct.Team) {
			trackers = append(trackers, &ec.CombatantTracker[index])
		}
	}
	// existing found
	if len(trackers) > 0 {
		return trackers
	}
	// new tracker
	log.Println("[", ec.userIDHash, "][ Encounter", ec.Encounter.UID, "] New combatant", name, "(", maxHP, ")")
	newCt := encounterCollectorCombatantTracker{
		Name:           name,
		MaxHP:          maxHP,
		Team:           0,
		IsAlive:        true,
		LastActionTime: time.Time{},
	}
	ec.CombatantTracker = append(ec.CombatantTracker, newCt)
	trackers = append(trackers, &ec.CombatantTracker[len(ec.CombatantTracker)-1])
	return trackers
}

// getCombatantTracker - Get first matching tracked combatant
func (ec *EncounterCollector) getCombatantTracker(name string, maxHP int) *encounterCollectorCombatantTracker {
	trackers := ec.getCombatantTrackers(name, maxHP)
	if len(trackers) == 0 {
		return nil
	}
	return trackers[0]
}

// logEncounterReport - Log report of current encounter
func (ec *EncounterCollector) logEncounterReport() {
	ec.LastReportTime = time.Now()
	delta := ec.LastActionTime.Sub(ec.Encounter.StartTime)
	encTimeString := fmt.Sprintf("%02d:%02d", int(delta.Minutes()), int(delta.Seconds())&60)
	aliveString := ""
	combatantTimeoutTime := time.Now().Add(time.Duration(-combatantTimeout) * time.Millisecond)
	for team := 1; team <= 2; team++ {
		teamAlive := make([]string, 0)
		for _, ct := range ec.CombatantTracker {
			if ct.Team == uint8(team) && ct.IsAlive && (ct.WasAttacked || combatantTimeoutTime.Before(ct.LastActionTime)) {
				teamAlive = append(teamAlive, ct.Name)
			}
		}
		if aliveString != "" {
			aliveString += " -- "
		}
		aliveString += fmt.Sprintf("TEAM %d: %d alive (%s)", team, len(teamAlive), strings.Join(teamAlive, ","))
	}
	log.Println("[", ec.userIDHash, "][ Encounter", ec.Encounter.UID, "]", encTimeString, aliveString)
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
	ec.logEncounterReport()
	ec.Encounter.Active = false
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
				// time should have passed since last encounter
				if time.Now().Add(time.Duration(-encounterInactiveTime) * time.Millisecond).Before(ec.LastActionTime) {
					break
				}
				log.Println("[", ec.userIDHash, "][ Encounter", ec.Encounter.UID, "] Started")
				ec.Encounter.Active = true
				ec.Encounter.StartTime = l.Time
				ec.LastReportTime = time.Now()
			}
			// update encounter end time
			if ec.Encounter.EndTime.Before(l.Time) {
				ec.Encounter.EndTime = l.Time
			}
			// ignore actions where attacker is targeting self
			if l.AttackerName == l.TargetName {
				break
			}
			// gather combatant tracker data
			ctAttacker := ec.getCombatantTracker(l.AttackerName, l.AttackerMaxHP)
			if ctAttacker == nil {
				break
			}
			ctTarget := ec.getCombatantTracker(l.TargetName, l.TargetMaxHP)
			if ctTarget == nil {
				break
			}
			// set attacked flag
			ctTarget.WasAttacked = true
			// ignore log line if last action happened after this one
			if ctAttacker.LastActionTime.After(l.Time) || ctTarget.LastActionTime.After(l.Time) {
				break
			}
			// update combatant tracker data
			if !ctAttacker.IsAlive {
				ctAttacker.IsAlive = true
				log.Println("[", ec.userIDHash, "][ Encounter", ec.Encounter.UID, "] Combatant", ctAttacker.Name, "(", ctAttacker.MaxHP, ")", "is alive")
			}
			if !ctTarget.IsAlive {
				ctTarget.IsAlive = true
				log.Println("[", ec.userIDHash, "][ Encounter", ec.Encounter.UID, "] Combatant", ctTarget.Name, "(", ctTarget.MaxHP, ")", "is alive")
			}
			ctAttacker.LastActionTime = l.Time
			ctTarget.LastActionTime = l.Time
			ec.LastActionTime = l.Time
			// set teams if needed
			if ctAttacker.Team == 0 && ctTarget.Team == 0 {
				ctAttacker.Team = 1
				ctTarget.Team = 2
				log.Println("[", ec.userIDHash, "][ Encounter", ec.Encounter.UID, "] Combatant", ctAttacker.Name, "(", ctAttacker.MaxHP, ")", "is on team 1")
				log.Println("[", ec.userIDHash, "][ Encounter", ec.Encounter.UID, "] Combatant", ctTarget.Name, "(", ctTarget.MaxHP, ")", "is on team 2")
			} else if ctAttacker.Team == 0 && ctTarget.Team != 0 {
				ctAttacker.Team = 1
				if ctTarget.Team == 1 {
					ctAttacker.Team = 2
				}
				log.Println("[", ec.userIDHash, "][ Encounter", ec.Encounter.UID, "] Combatant", ctAttacker.Name, "(", ctAttacker.MaxHP, ")", "is on team", ctAttacker.Team)
			} else if ctAttacker.Team != 0 && ctTarget.Team == 0 {
				ctTarget.Team = 1
				if ctAttacker.Team == 1 {
					ctTarget.Team = 2
				}
				log.Println("[", ec.userIDHash, "][ Encounter", ec.Encounter.UID, "] Combatant", ctTarget.Name, "(", ctTarget.MaxHP, ")", "is on team", ctTarget.Team)
			}
			break
		}
	case LogTypeDefeat, LogTypeRemoveCombatant:
		{
			// must be active
			if !ec.Encounter.Active {
				return
			}
			// get combatant tracker data
			ctTargets := ec.getCombatantTrackers(l.TargetName, l.TargetMaxHP)
			if len(ctTargets) == 0 {
				break
			}
			// itterate combatant trackers
			for _, ctTarget := range ctTargets {
				// ignore log line if last action happened after this one
				if ctTarget.LastActionTime.After(l.Time) {
					break
				}
				// update target
				if l.Type == LogTypeDefeat {
					ctTarget.LastActionTime = l.Time
					ec.LastActionTime = l.Time
				}
				if ctTarget.IsAlive {
					ctTarget.IsAlive = false
					log.Println("[", ec.userIDHash, "][ Encounter", ec.Encounter.UID, "] Combatant", ctTarget.Name, "(", ctTarget.MaxHP, ")", "was defeated/removed")
				}
			}
			break
		}
	case LogTypeZoneChange:
		{
			log.Println("[", ec.userIDHash, "] Zone changed to", l.TargetName)
			if ec.CurrentZone != l.TargetName {
				ec.CurrentZone = l.TargetName
			}
			break
		}
	case LogTypeGameLog:
		{

			switch l.Color {
			case LogColorCharacterWorldName:
				{
					if ec.PlayerTeam > 0 {
						break
					}
					if l.TargetName != "" && l.AttackerName != "" {
						playerName := strings.TrimSpace(strings.ToUpper(l.AttackerName))
						for _, ct := range ec.CombatantTracker {
							if ct.Name == playerName && ct.Team != 0 {
								ec.PlayerTeam = ct.Team
								log.Println("[", ec.userIDHash, "][ Encounter", ec.Encounter.UID, "] Player team set to", ct.Team)
								break
							}
						}
					}
				}
			case LogColorObtainItem:
				{
					// if message about tomestones is recieved then that should mean the encounter is over
					re, err := regexp.Compile("00:083e:You obtain .* Allagan tomestones of")
					if err != nil {
						break
					}
					// end encounter if match
					if re.MatchString(l.Raw) {
						ec.CompletionFlag = true
					}
					break
				}
			case LogColorCompletionTime:
				{
					// if message about completion time then that should mean the encounter is over
					re, err := regexp.Compile("00:0840:.* completion time: ")
					if err != nil {
						break
					}
					// end encounter if match
					if re.MatchString(l.Raw) {
						ec.CompletionFlag = true
					}
					break
				}
			case LogColorCastLot:
				{
					re, err := regexp.Compile("00:0839:Cast your lot|00:0839:One or more party members have yet to complete this duty|00:0839:You received a player commendation")
					if err != nil {
						break
					}
					// end encounter if match
					if re.MatchString(l.Raw) {
						ec.CompletionFlag = true
					}
					break
				}
			}
		}
	}
	// log encounter report
	if time.Now().Add(time.Duration(-reportDisplayIntervals)*time.Millisecond).After(ec.LastReportTime) && ec.Encounter.Active {
		ec.logEncounterReport()
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
	// flagged as cleared
	if ec.CompletionFlag {
		ec.Encounter.SuccessLevel = 1
		ec.endEncounter()
		return
	}
	// check if new zone
	if ec.CurrentZone != ec.Encounter.Zone && ec.Encounter.Zone != "" {
		log.Println("[", ec.userIDHash, "][ Encounter", ec.Encounter.UID, "] New zone detected.", ec.CurrentZone, ec.Encounter.Zone)
		ec.Encounter.SuccessLevel = 0
		ec.endEncounter()
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
	if combatantCount < 2 || ec.PlayerTeam <= 0 {
		return
	}
	// check to see if player team is dead
	combatantTimeoutTime := time.Now().Add(time.Duration(-combatantTimeout) * time.Millisecond)
	teamDead := true
	for _, ct := range ec.CombatantTracker {
		// if combatant on same team, is flagged as alive, and was either attacked by something previously
		// or has not timed out then team is still alive
		if ct.Team == ec.PlayerTeam && ct.IsAlive && (ct.WasAttacked || combatantTimeoutTime.Before(ct.LastActionTime)) {
			teamDead = false
			break
		}
	}
	if teamDead {
		// set wipe
		ec.Encounter.SuccessLevel = 2
		ec.endEncounter()
		return
	}
}
