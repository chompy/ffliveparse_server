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

// combatantTracker - Data used to track combatant
type combatantTracker struct {
	Combatant  Combatant
	LastUpdate Combatant
}

// CombatantCollector - Combatant data collector
type CombatantCollector struct {
	CombatantTrackers []combatantTracker
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
	c.CombatantTrackers = make([]combatantTracker, 0)
}

// UpdateCombatantTracker - Sync ACT combatant data
func (c *CombatantCollector) UpdateCombatantTracker(combatant Combatant) {
	// ignore invalid combatants
	if combatant.ID > 1000000000 && combatant.Job != "" && combatant.ParentID == 0 {
		return
	}
	// update existing
	for index := range c.CombatantTrackers {
		if c.CombatantTrackers[index].Combatant.ID == combatant.ID && c.CombatantTrackers[index].Combatant.ActName == combatant.ActName {
			// reset combatant if new encounter
			if c.CombatantTrackers[index].LastUpdate.EncounterUID != combatant.EncounterUID {
				c.CombatantTrackers[index].Combatant = combatant
			}
			// check for new ACT encounter and update
			newEncounter := false
			if c.CombatantTrackers[index].LastUpdate.ActEncounterID != combatant.ActEncounterID {
				newEncounter = true
			}
			// damage dealt
			if !newEncounter && c.CombatantTrackers[index].LastUpdate.Damage <= combatant.Damage {
				c.CombatantTrackers[index].Combatant.Damage += combatant.Damage - c.CombatantTrackers[index].LastUpdate.Damage
			} else if newEncounter {
				c.CombatantTrackers[index].Combatant.Damage += combatant.Damage
			}
			// healing
			if !newEncounter && c.CombatantTrackers[index].LastUpdate.DamageHealed <= combatant.DamageHealed {
				c.CombatantTrackers[index].Combatant.DamageHealed += combatant.DamageHealed - c.CombatantTrackers[index].LastUpdate.DamageHealed
			} else if newEncounter {
				c.CombatantTrackers[index].Combatant.DamageHealed += combatant.DamageHealed
			}
			// damage recieved
			if !newEncounter && c.CombatantTrackers[index].LastUpdate.DamageTaken <= combatant.DamageTaken {
				c.CombatantTrackers[index].Combatant.DamageTaken += combatant.DamageTaken - c.CombatantTrackers[index].LastUpdate.DamageTaken
			} else if newEncounter {
				c.CombatantTrackers[index].Combatant.DamageTaken += combatant.DamageTaken
			}
			// deaths
			if !newEncounter && c.CombatantTrackers[index].LastUpdate.Deaths <= combatant.Deaths {
				c.CombatantTrackers[index].Combatant.Deaths += combatant.Deaths - c.CombatantTrackers[index].LastUpdate.Deaths
			} else if newEncounter {
				c.CombatantTrackers[index].Combatant.Deaths += combatant.Deaths
			}
			// heal count
			if !newEncounter && c.CombatantTrackers[index].LastUpdate.Heals <= combatant.Heals {
				c.CombatantTrackers[index].Combatant.Heals += combatant.Heals - c.CombatantTrackers[index].LastUpdate.Heals
			} else if newEncounter {
				c.CombatantTrackers[index].Combatant.Heals += combatant.Heals
			}
			// hit count
			if !newEncounter && c.CombatantTrackers[index].LastUpdate.Hits <= combatant.Hits {
				c.CombatantTrackers[index].Combatant.Hits += combatant.Hits - c.CombatantTrackers[index].LastUpdate.Hits
			} else if newEncounter {
				c.CombatantTrackers[index].Combatant.Hits += combatant.Hits
			}
			// kill count
			if !newEncounter && c.CombatantTrackers[index].LastUpdate.Kills <= combatant.Kills {
				c.CombatantTrackers[index].Combatant.Kills += combatant.Kills - c.CombatantTrackers[index].LastUpdate.Kills
			} else if newEncounter {
				c.CombatantTrackers[index].Combatant.Kills += combatant.Kills
			}
			// update last combatant
			c.CombatantTrackers[index].LastUpdate = combatant
			return
		}
	}
	// create new
	log.Println("[", c.userIDHash, "][ Combatant", combatant.ID, "] Added", combatant.Name, combatant.ID, combatant.Job)
	ct := combatantTracker{
		Combatant:  combatant,
		LastUpdate: combatant,
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
				if len(c.CombatantTrackers[index].Combatant.Job) == 0 || strings.Contains(c.CombatantTrackers[index].Combatant.Name, " (") {
					continue
				}
				if c.CombatantTrackers[index].Combatant.ID == int32(l.AttackerID) && c.CombatantTrackers[index].Combatant.Name != l.AttackerName {
					c.CombatantTrackers[index].Combatant.Name = l.AttackerName
					log.Println("[", c.userIDHash, "][ Combatant", c.CombatantTrackers[index].Combatant.ID, "] Set name", l.AttackerName)
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
							if c.CombatantTrackers[index].Combatant.Name == l.AttackerName && c.CombatantTrackers[index].Combatant.World != l.TargetName {
								c.CombatantTrackers[index].Combatant.World = l.TargetName
								log.Println("[", c.userIDHash, "][ Combatant", c.CombatantTrackers[index].Combatant.ID, "] Set world name", l.TargetName)
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
		if ct.Combatant.ID >= 1000000000 && ct.Combatant.ParentID == 0 {
			if strings.Contains(ct.Combatant.Name, " (") {
				// is pet, fix
				nameSplit := strings.Split(ct.Combatant.Name, " (")
				ownerName := nameSplit[1][:len(nameSplit[1])-1]
				hasParent := false
				for _, ownerCt := range c.CombatantTrackers {
					if ownerCt.Combatant.ID < 1000000000 && ownerName == ownerCt.Combatant.Name {
						hasParent = true
						c.CombatantTrackers[index].Combatant.Name = nameSplit[0]
						c.CombatantTrackers[index].Combatant.ParentID = ownerCt.Combatant.ID
						c.CombatantTrackers[index].Combatant.Job = "Pet"
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
	for index := range c.CombatantTrackers {
		combatants = append(combatants, c.CombatantTrackers[index].Combatant)
	}
	return combatants
}
