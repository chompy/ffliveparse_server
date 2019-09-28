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
	"time"

	"../app"
	"../data"
)

// combatantManagerUpdateInterval - rate at which combatant manager will accept new combatants
const combatantManagerUpdateInterval = 1000

// CombatantManager - handles combatant data for an encounter
type CombatantManager struct {
	encounterUID string
	combatants   []data.Combatant
	log          app.Logging
}

// NewCombatantManager - create new combatant manager
func NewCombatantManager() CombatantManager {
	c := CombatantManager{
		log: app.Logging{ModuleName: "COMBATANT"},
	}
	c.Reset()
	return c
}

// Reset - reset combatant manager
func (c *CombatantManager) Reset() {
	c.combatants = make([]data.Combatant, 0)
	c.encounterUID = ""
}

// Update - add a combatant update
func (c *CombatantManager) Update(combatant data.Combatant) error {
	// set encounter UID if not set
	if c.encounterUID == "" {
		c.encounterUID = combatant.EncounterUID
		c.log.ModuleName = "COMBATANT/" + c.encounterUID
	}
	// not matching encounter UID
	if combatant.EncounterUID != c.encounterUID {
		return nil
	}
	// find last update for this player
	var lastCombatant *data.Combatant
	lastCombatantIndex := 0
	for index := range c.combatants {
		if c.combatants[index].Player.ID == combatant.Player.ID && (lastCombatant == nil || c.combatants[index].Time.After(lastCombatant.Time)) {
			lastCombatant = &c.combatants[index]
			lastCombatantIndex = index
		}
	}
	// not enough time passed, update the last combatant with this new data
	if lastCombatant != nil && time.Now().Sub(lastCombatant.Time) < time.Duration(time.Millisecond*combatantManagerUpdateInterval) {
		c.combatants[lastCombatantIndex] = combatant
		return nil
	}
	// add a new combatant
	c.combatants = append(c.combatants, combatant)
	return nil
}

// ReadLogLine - parse log line and update combatant(s)
func (c *CombatantManager) ReadLogLine(l *ParsedLogLine) {
	switch l.Type {
	case LogTypeSingleTarget, LogTypeAoe:
		{
			// sync name
			for index := range c.combatants {
				player := &c.combatants[index].Player
				if player.ID == int32(l.AttackerID) && player.Name != l.AttackerName {
					player.Name = l.AttackerName
					c.log.Log(fmt.Sprintf("Set combatant '%d' name to '%s.'", player.ID, l.AttackerName))
				}
			}
			break
		}
	case LogTypeGameLog:
		{
			switch l.GameLogType {
			case LogMsgIDCharacterWorldName:
				{
					if l.TargetName != "" && l.AttackerName != "" {
						// sync world
						for index := range c.combatants {
							player := &c.combatants[index].Player
							if player.Name == l.AttackerName && player.World != l.TargetName {
								player.World = l.TargetName
								c.log.Log(fmt.Sprintf("Set combatant '%d' world to '%s.'", player.ID, l.TargetName))
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

// GetPlayers - get list of players in encounter
func (c *CombatantManager) GetPlayers() []data.Player {
	output := make([]data.Player, 0)
	for index := range c.combatants {
		combatant := &c.combatants[index]
		hasCombatant := false
		for oIndex := range output {
			if combatant.Player.ID == output[oIndex].ID {
				if combatant.Player.Name == "" && output[oIndex].Name != "" {
					output[oIndex].Name = combatant.Player.Name
				}
				if combatant.Player.World == "" && output[oIndex].World != "" {
					output[oIndex].World = combatant.Player.World
				}
				hasCombatant = true
				break
			}
		}
		if hasCombatant {
			continue
		}
		output = append(output, combatant.Player)
	}
	return output
}

// GetCombatants - get list of all combatant snapshots in encounter
func (c *CombatantManager) GetCombatants() []data.Combatant {
	output := make([]data.Combatant, 0)
	// map combatants by player
	playerMap := make(map[int32][]*data.Combatant)
	for index := range c.combatants {
		if playerMap[c.combatants[index].Player.ID] == nil {
			playerMap[c.combatants[index].Player.ID] = make([]*data.Combatant, 0)
		}
		playerMap[c.combatants[index].Player.ID] = append(playerMap[c.combatants[index].Player.ID], &c.combatants[index])
	}
	// analyze and combine
	for playerID := range playerMap {
		combatant := data.Combatant{}
		for index := range playerMap[playerID] {
			if index == 0 {
				combatant = *playerMap[playerID][index]
				continue
			}
			lastCombatant := playerMap[playerID][index-1]
			nextCombatant := playerMap[playerID][index]
			if nextCombatant.Hits < lastCombatant.Hits || nextCombatant.Heals < lastCombatant.Heals {
				// hits/heals less then previous combatant update, assume ACT reset
				combatant.Damage += nextCombatant.Damage
				combatant.DamageTaken += nextCombatant.DamageTaken
				combatant.DamageHealed += nextCombatant.DamageHealed
				combatant.Deaths += nextCombatant.Deaths
				combatant.Hits += nextCombatant.Hits
				combatant.Heals += nextCombatant.Heals
				combatant.Kills += nextCombatant.Kills
			} else {
				// normal increment
				combatant.Damage += nextCombatant.Damage - lastCombatant.Damage
				combatant.DamageTaken += nextCombatant.DamageTaken - lastCombatant.DamageTaken
				combatant.DamageHealed += nextCombatant.DamageHealed - lastCombatant.DamageHealed
				combatant.Deaths += nextCombatant.Deaths - lastCombatant.Deaths
				combatant.Hits += nextCombatant.Hits - lastCombatant.Hits
				combatant.Heals += nextCombatant.Heals - lastCombatant.Heals
				combatant.Kills += nextCombatant.Kills - lastCombatant.Kills
			}
			output = append(output, combatant)
		}
	}
	return output
}
