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
	Offset     Combatant
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

// combatantAdd - add the values of two combatants together
func combatantAdd(c1 Combatant, c2 Combatant) Combatant {
	c1.Damage += c2.Damage
	c1.DamageHealed += c2.DamageHealed
	c1.DamageTaken += c2.DamageTaken
	c1.Deaths += c2.Deaths
	c1.Heals += c2.Heals
	c1.Hits += c2.Hits
	c1.Kills += c2.Kills
	return c1
}

// combatantSub - subtract the values of two combatants
func combatantSub(c1 Combatant, c2 Combatant) Combatant {
	c1.Damage -= c2.Damage
	c1.DamageHealed -= c2.DamageHealed
	c1.DamageTaken -= c2.DamageTaken
	c1.Deaths -= c2.Deaths
	c1.Heals -= c2.Heals
	c1.Hits -= c2.Hits
	c1.Kills -= c2.Kills
	return c1
}

// UpdateCombatantTracker - Sync ACT combatant data
func (c *CombatantCollector) UpdateCombatantTracker(combatant Combatant) {
	// ignore invalid combatants
	if combatant.ID > 1000000000 || combatant.Job == "" {
		return
	}
	// update existing
	for index := range c.CombatantTrackers {
		if c.CombatantTrackers[index].Combatant.ID == combatant.ID && c.CombatantTrackers[index].Combatant.ActName == combatant.ActName {
			// get combatant if new encounter
			if c.CombatantTrackers[index].LastUpdate.EncounterUID != combatant.EncounterUID {
				c.CombatantTrackers[index].Combatant = combatant
				c.CombatantTrackers[index].Offset = combatant
				c.CombatantTrackers[index].LastUpdate = combatant
			} else if c.CombatantTrackers[index].LastUpdate.ActEncounterID == combatant.ActEncounterID {
				// perform action depending if ACT encounter id has updated
				// no update, update combatant stats with diff between last one and new one
				combatantDiff := combatantSub(combatant, c.CombatantTrackers[index].LastUpdate)
				c.CombatantTrackers[index].Combatant = combatantAdd(
					c.CombatantTrackers[index].Combatant,
					combatantDiff,
				)
			} else {
				// update, add new one to old one
				c.CombatantTrackers[index].Combatant = combatantAdd(
					c.CombatantTrackers[index].Combatant,
					combatant,
				)
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
		Offset:     combatant,
	}
	c.CombatantTrackers = append(c.CombatantTrackers, ct)
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

// GetCombatants - Compile all combatants
func (c *CombatantCollector) GetCombatants() []Combatant {
	combatants := make([]Combatant, 0)
	for index := range c.CombatantTrackers {
		combatants = append(
			combatants,
			combatantSub(c.CombatantTrackers[index].Combatant, c.CombatantTrackers[index].Offset),
		)
	}
	return combatants
}
