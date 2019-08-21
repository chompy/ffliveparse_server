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
	"time"

	"../user"
)

// combatantTracker - Data used to track combatant
type combatantTracker struct {
	Player    Player
	Snapshots []Combatant // combatant data captured at points in time
	Offset    Combatant
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
	// ignore non player combatants
	if combatant.Player.ID > 1000000000 {
		return
	}
	// fix limit break combatant data
	if combatant.Job == "" {
		for _, ct := range c.CombatantTrackers {
			if ct.Player.ID == combatant.Player.ID {
				combatant.Job = "LB"
				combatant.Player = Player{
					ID:      -99,
					ActName: "Limit Break",
					Name:    "Limit Break",
				}
				break
			}
		}
		if combatant.Job == "" {
			return
		}
	}
	// update existing
	for index := range c.CombatantTrackers {
		player := &c.CombatantTrackers[index].Player
		lastSnapshot := c.CombatantTrackers[index].Snapshots[len(c.CombatantTrackers[index].Snapshots)-1]
		if player.ID == combatant.Player.ID && player.ActName == combatant.Player.ActName {
			if lastSnapshot.EncounterUID != combatant.EncounterUID {
				// if act still has previous encounter but we want a new encounter in
				// live parse create an offset with the last snapshot as a negative offset
				c.CombatantTrackers[index].Offset = combatantSub(
					Combatant{},
					lastSnapshot,
				)
			} else if lastSnapshot.ActEncounterID != combatant.ActEncounterID {
				// if act has a new encounter but we want to continue an encounter in
				// live parse then create an offset with last snapshot
				c.CombatantTrackers[index].Offset = lastSnapshot
			}
			// update last combatant with offset
			c.CombatantTrackers[index].Snapshots = append(
				c.CombatantTrackers[index].Snapshots,
				combatantAdd(
					combatant,
					c.CombatantTrackers[index].Offset,
				),
			)
			return
		}
	}
	// create new
	log.Println("[", c.userIDHash, "][ Combatant", combatant.Player.ID, "] Added", combatant.Player.Name, "(", combatant.Job, ")")
	ct := combatantTracker{
		Player:    combatant.Player,
		Snapshots: make([]Combatant, 0),
		Offset:    Combatant{},
	}
	ct.Snapshots = append(ct.Snapshots, combatant)
	c.CombatantTrackers = append(c.CombatantTrackers, ct)
}

// ReadLogLine - Parse log line and update combatant(s)
func (c *CombatantCollector) ReadLogLine(l *LogLineData) {
	switch l.Type {
	case LogTypeSingleTarget, LogTypeAoe:
		{
			// sync name
			for index := range c.CombatantTrackers {
				player := &c.CombatantTrackers[index].Player
				if player.ID == int32(l.AttackerID) && player.Name != l.AttackerName {
					player.Name = l.AttackerName
					log.Println("[", c.userIDHash, "][ Combatant", player.ID, "] Set name", l.AttackerName)
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
							player := &c.CombatantTrackers[index].Player
							if player.Name == l.AttackerName && player.World != l.TargetName {
								player.World = l.TargetName
								log.Println("[", c.userIDHash, "][ Combatant", player.ID, "] Set world name", l.TargetName)
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
func (c *CombatantCollector) GetCombatants() [][]Combatant {
	combatants := make([][]Combatant, 0)
	for _, ct := range c.CombatantTrackers {
		snapshots := make([]Combatant, 0)
		lastSnapshotTime := time.Time{}
		for _, snapshot := range ct.Snapshots {
			if snapshot.Time.Sub(lastSnapshotTime) > time.Duration(time.Second*3) {
				snapshot.Player = ct.Player
				snapshots = append(snapshots, snapshot)
				lastSnapshotTime = snapshot.Time
			}
		}
		if len(snapshots) == 0 && len(ct.Snapshots) > 0 {
			snapshots = append(snapshots, ct.Snapshots[0])
		}
		combatants = append(
			combatants,
			snapshots,
		)
	}
	return combatants
}
