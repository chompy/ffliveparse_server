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

	"../user"
)

// combatantCollectorCombatantTracker - Track combatant data and
type combatantCollectorCombatantTracker struct {
	Start Combatant
	Data  []Combatant
}

// CombatantCollector - Combatant data collector
type CombatantCollector struct {
	CombatantTrackers []combatantCollectorCombatantTracker
	userIDHash        string
}

// NewCombatantCollector - create new combatant collector
func NewCombatantCollector(user *user.Data) CombatantCollector {
	userIDHash, _ := user.GetWebIDString()
	cc := CombatantCollector{
		userIDHash: userIDHash,
	}
	cc.Reset()
	return cc
}

// Reset - reset combatant collector
func (c *CombatantCollector) Reset() {
	c.CombatantTrackers = make([]combatantCollectorCombatantTracker, 0)
}

// UpdateCombatantTracker - Sync ACT combatant data
func (c *CombatantCollector) UpdateCombatantTracker(combatant Combatant) {
	// ignore invalid combatants
	if combatant.ID > 1000000000 && combatant.Job != "" && combatant.ParentID == 0 {
		return
	}
	// update existing
	for index := range c.CombatantTrackers {
		if c.CombatantTrackers[index].Start.ID == combatant.ID {
			for cIndex := range c.CombatantTrackers[index].Data {
				// update existing encounter combatant
				if c.CombatantTrackers[index].Data[cIndex].ActEncounterID == combatant.ActEncounterID {
					c.CombatantTrackers[index].Data[cIndex] = combatant
					return
				}
			}
			// add new combatant encounter
			c.CombatantTrackers[index].Data = append(c.CombatantTrackers[index].Data, combatant)
			return
		}
	}
	// create new
	log.Println("[", c.userIDHash, "][ Combatant", combatant.ID, "] Added", combatant.Name, combatant.ID, combatant.Job)
	ct := combatantCollectorCombatantTracker{
		Start: combatant,
		Data:  make([]Combatant, 0),
	}
	c.CombatantTrackers = append(c.CombatantTrackers, ct)
	c.resolvePets()
}

// ReadLogLine - Parse log line and update combatant(s)
func (c *CombatantCollector) ReadLogLine(l *LogLineData) {
	switch l.Type {
	case LogTypeSingleTarget, LogTypeAoe:
		{
			// sync name
			for index := range c.CombatantTrackers {
				// ignore pets/non job combatants
				if len(c.CombatantTrackers[index].Start.Job) == 0 || strings.Contains(c.CombatantTrackers[index].Start.Name, " (") {
					continue
				}
				if c.CombatantTrackers[index].Start.ID == int32(l.AttackerID) && c.CombatantTrackers[index].Start.Name != l.AttackerName {
					c.CombatantTrackers[index].Start.Name = l.AttackerName
					log.Println("[", c.userIDHash, "][ Combatant", c.CombatantTrackers[index].Start.ID, "] Set name", l.AttackerName)
				}
			}
			break
		}
	case LogTypeGameLog:
		{
			switch l.Color {
			case LogColorCharacterWorldName:
				{
					if l.TargetName != "" && l.AttackerName != "" {
						// sync world
						for index := range c.CombatantTrackers {
							if c.CombatantTrackers[index].Start.Name == l.AttackerName && c.CombatantTrackers[index].Start.World != l.TargetName {
								c.CombatantTrackers[index].Start.World = l.TargetName
								log.Println("[", c.userIDHash, "][ Combatant", c.CombatantTrackers[index].Start.ID, "] Set world name", l.TargetName)
								break
							}
						}
					}
					break
				}
			}
			break
		}
	}
}

// resolvePets - Link pets to their owners
func (c *CombatantCollector) resolvePets() {
	for index, ct := range c.CombatantTrackers {
		// > 1000000000 ID seems to be player summoned entities
		if ct.Start.ID >= 1000000000 && ct.Start.ParentID == 0 {
			if strings.Contains(ct.Start.Name, " (") {
				// is pet, fix
				nameSplit := strings.Split(ct.Start.Name, " (")
				ownerName := nameSplit[1][:len(nameSplit[1])-1]
				hasParent := false
				for _, ownerCt := range c.CombatantTrackers {
					if ownerCt.Start.ID < 1000000000 && ownerName == ownerCt.Start.Name {
						hasParent = true
						c.CombatantTrackers[index].Start.Name = nameSplit[0]
						c.CombatantTrackers[index].Start.ParentID = ownerCt.Start.ID
						c.CombatantTrackers[index].Start.Job = "Pet"
						break
					}
				}
				// cannot find an owner
				if !hasParent {
					//c.CombatantTrackers = append(c.CombatantTrackers[:index], c.CombatantTrackers[index+1])
					return
				}
			}
		}
	}
}

// GetCombatants - Compile all combatants
func (c *CombatantCollector) GetCombatants() []Combatant {
	combatants := make([]Combatant, 0)
	for _, ct := range c.CombatantTrackers {
		combatant := ct.Start
		for _, ctData := range ct.Data {
			combatant.Damage += ctData.Damage
			combatant.DamageHealed += ctData.DamageHealed
			combatant.DamageTaken += ctData.DamageTaken
			combatant.Deaths += ctData.Deaths
			combatant.Heals += ctData.Heals
			combatant.Hits += ctData.Hits
			combatant.Kills += ctData.Kills
		}
		if len(ct.Data) > 0 {
			combatant.Damage -= ct.Start.Damage
			combatant.DamageHealed -= ct.Start.DamageHealed
			combatant.DamageTaken -= ct.Start.DamageTaken
			combatant.Deaths -= ct.Start.Deaths
			combatant.Heals -= ct.Start.Heals
			combatant.Hits -= ct.Start.Hits
			combatant.Kills -= ct.Start.Kills
		}
		combatants = append(combatants, combatant)
	}
	return combatants
}
