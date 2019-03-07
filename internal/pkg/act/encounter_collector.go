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
	"time"

	"github.com/rs/xid"
)

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
	Combatants       []Combatant
	CombatantTracker []encounterCollectorCombatantTracker
}

// NewEncounterCollector - Create new encounter collector
func NewEncounterCollector() EncounterCollector {
	ec := EncounterCollector{
		Encounter: Encounter{
			Active: false,
		},
		Combatants:       make([]Combatant, 0),
		CombatantTracker: make([]encounterCollectorCombatantTracker, 0),
	}
	return ec
}

// StartEncounter - Start new encounter
func (ec *EncounterCollector) StartEncounter() {
	encounterUIDGenerator := xid.New()
	ec.Encounter.Active = true
	ec.Encounter.StartTime = time.Now()
	ec.Encounter.EndTime = time.Now()
	ec.Encounter.UID = encounterUIDGenerator.String()
	ec.Encounter.Zone = "(Unknown)"
	ec.Encounter.SuccessLevel = 1
	ec.Encounter.Damage = 0
	ec.CombatantTracker = make([]encounterCollectorCombatantTracker, 0)
	ec.Combatants = make([]Combatant, 0)
}

// UpdateEncounter - Sync encounter data from ACT
func (ec *EncounterCollector) UpdateEncounter(encounter Encounter) {
	ec.Encounter.Zone = encounter.Zone
}

// getCombatantTracker - Get combatant to track
func (ec *EncounterCollector) getCombatantTracker(name string) *encounterCollectorCombatantTracker {
	for index, ct := range ec.CombatantTracker {
		if ct.Name == name {
			return &ec.CombatantTracker[index]
		}
	}
	newCt := encounterCollectorCombatantTracker{
		Name:           name,
		Team:           0,
		IsAlive:        true,
		LastActionTime: time.Time{},
	}
	ec.CombatantTracker = append(ec.CombatantTracker, newCt)
	return &ec.CombatantTracker[len(ec.CombatantTracker)-1]
}

// ReadLogLine - Parse log line and determine encounter status
func (ec *EncounterCollector) ReadLogLine(l *LogLineData) {
	switch l.Type {
	case LogTypeSingleTarget:
	case LogTypeAoe:
		{
			// must be damage action
			if !l.HasFlag(LogFlagDamage) {
				return
			}
			// gather combatant tracker data
			ctAttacker := ec.getCombatantTracker(l.AttackerName)
			ctTarget := ec.getCombatantTracker(l.TargetName)
			// ignore log line if last action happened after this one
			if ctAttacker.LastActionTime.After(l.Time) || ctTarget.LastActionTime.After(l.Time) {
				return
			}
			// update combatant tracker data
			ctAttacker.IsAlive = true
			ctTarget.IsAlive = true
			ctAttacker.LastActionTime = l.Time
			ctTarget.LastActionTime = l.Time
			// set teams if needed
			if ctAttacker.Team == 0 && ctTarget.Team == 0 {
				ctAttacker.Team = 1
				ctTarget.Team = 2
			} else if ctAttacker.Team == 0 && ctTarget.Team != 0 {
				ctAttacker.Team = 1
				if ctTarget.Team == 1 {
					ctAttacker.Team = 2
				}
			} else if ctAttacker.Team != 0 && ctTarget.Team == 0 {
				ctTarget.Team = 1
				if ctAttacker.Team == 1 {
					ctTarget.Team = 2
				}
			}
		}
	case LogTypeDefeat:
		{
			// get combatant tracker data
			ctTarget := ec.getCombatantTracker(l.TargetName)
			// ignore log line if last action happened after this one
			if ctTarget.LastActionTime.After(l.Time) {
				return
			}
			// update target
			ctTarget.IsAlive = false
			ctTarget.LastActionTime = l.Time
		}
	}
}
