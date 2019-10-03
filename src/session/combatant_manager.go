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
	"time"

	"../app"
	"../data"
)

// combatantManagerUpdateInterval - rate at which combatant manager will accept new combatants
const combatantManagerUpdateInterval = 2500

// CombatantManager - handles combatant data for an encounter
type CombatantManager struct {
	combatants         []*data.Combatant
	lastEncounter      map[int32]*data.Combatant
	log                app.Logging
	encounterUID       string
	encounterStartTime time.Time
	lastUpdate         time.Time
}

// NewCombatantManager - create new combatant manager
func NewCombatantManager() CombatantManager {
	c := CombatantManager{
		log:                app.Logging{ModuleName: "COMBATANT"},
		encounterStartTime: time.Now().Add(time.Hour * 999),
	}
	c.Reset()
	return c
}

// Reset - reset combatant manager
func (c *CombatantManager) Reset() {
	c.combatants = make([]*data.Combatant, 0)
	c.lastEncounter = make(map[int32]*data.Combatant, 0)
	c.lastUpdate = time.Time{}
	c.encounterUID = ""
}

// ResetEncounter - reset with new encounter data
func (c *CombatantManager) ResetEncounter(encounter data.Encounter) {
	oldCombatants := c.combatants
	c.Reset()
	c.encounterUID = encounter.UID
	c.encounterStartTime = encounter.StartTime
	for index := range oldCombatants {
		playerID := oldCombatants[index].Player.ID
		if oldCombatants[index].Time.After(c.encounterStartTime) {
			c.combatants = append(c.combatants, oldCombatants[index])
		}
		if c.lastEncounter[playerID] == nil || oldCombatants[index].Time.After(c.lastEncounter[playerID].Time) {
			if oldCombatants[index].Time.Before(c.encounterStartTime) {
				c.lastEncounter[playerID] = oldCombatants[index]
			}
		}
	}
}

// Update - add a combatant update
func (c *CombatantManager) Update(combatant data.Combatant) {
	// ignore non player combatants
	if combatant.Player.ID > 1000000000 {
		return
	}
	// combatant update before encounter start time
	if combatant.Time.Before(c.encounterStartTime) {
		return
	}
	// fix limit break combatant data
	if combatant.Job == "" {
		for index := range c.combatants {
			if c.combatants[index].Player.ID == combatant.Player.ID {
				combatant.Job = "LB"
				combatant.Player = data.Player{
					ID:      -99,
					ActName: "Limit Break",
					Name:    "Limit Break",
				}
				combatant.PlayerID = -99
				break
			}
		}
		if combatant.Job == "" {
			return
		}
	}
	// find last update for this player
	var lastCombatant *data.Combatant
	for index := range c.combatants {
		if c.combatants[index].Player.ID == combatant.Player.ID && (lastCombatant == nil || c.combatants[index].Time.After(lastCombatant.Time)) {
			lastCombatant = c.combatants[index]
		}
	}
	// ignore if new combatant took place before last update
	if lastCombatant != nil && combatant.Time.Before(lastCombatant.Time) {
		return
	}
	// grab player name from last combatant
	if lastCombatant != nil {
		combatant.Player.Name = lastCombatant.Player.Name
		if lastCombatant.Player.World != "" {
			combatant.Player.World = lastCombatant.Player.World
		}
	}
	// not enough time passed, update the last combatant with this new data
	if lastCombatant != nil && combatant.Time.Sub(lastCombatant.Time) < time.Millisecond*combatantManagerUpdateInterval {
		lastCombatant = &combatant
		c.lastUpdate = combatant.Time
		return
	}
	// add a new combatant
	c.combatants = append(c.combatants, &combatant)
	if combatant.Time.After(c.lastUpdate) {
		c.lastUpdate = combatant.Time
	}
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
					//c.log.Log(fmt.Sprintf("Set combatant '%d' name to '%s.'", player.ID, l.AttackerName))
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
							player := c.combatants[index].Player
							if player.Name == l.AttackerName && player.World != l.TargetName {
								c.combatants[index].Player.World = l.TargetName
								//c.log.Log(fmt.Sprintf("Set combatant '%d' world to '%s.'", player.ID, l.TargetName))
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
		hasPlayer := false
		for pIndex := range output {
			if output[pIndex].ID == c.combatants[index].Player.ID {
				if c.combatants[index].Player.Name != output[pIndex].ActName {
					output[pIndex].Name = c.combatants[index].Player.Name
				}
				if c.combatants[index].Player.World != "" && output[pIndex].World == "" {
					output[pIndex].World = c.combatants[index].Player.World
				}
				hasPlayer = true
			}
		}
		if hasPlayer {
			continue
		}
		output = append(output, c.combatants[index].Player)
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
		playerMap[c.combatants[index].Player.ID] = append(playerMap[c.combatants[index].Player.ID], c.combatants[index])
	}
	// analyze and combine
	for playerID := range playerMap {
		offset := data.Combatant{}
		for index := range playerMap[playerID] {
			// set offset
			if index == 0 {
				if c.lastEncounter[playerID] != nil && playerMap[playerID][index].ActEncounterID == c.lastEncounter[playerID].ActEncounterID {
					offset = *c.lastEncounter[playerID]
				}
			}

			var lastCombatant *data.Combatant
			if index > 0 {
				lastCombatant = playerMap[playerID][index-1]
			}
			nextCombatant := playerMap[playerID][index]
			combatant := data.Combatant{}

			if lastCombatant != nil && lastCombatant.ActEncounterID != nextCombatant.ActEncounterID {
				offset = combatantSub(data.Combatant{}, *lastCombatant)
			}

			// set values
			combatant = combatantSub(*nextCombatant, offset)
			combatant.EncounterUID = c.encounterUID
			combatant.ActEncounterID = nextCombatant.ActEncounterID
			combatant.Time = nextCombatant.Time
			combatant.Player = nextCombatant.Player
			combatant.PlayerID = nextCombatant.Player.ID
			combatant.Job = nextCombatant.Job
			// add
			output = append(output, combatant)
		}
	}
	return output
}

// GetLastCombatants - get last combatant updates for each player
func (c *CombatantManager) GetLastCombatants() []data.Combatant {
	combatants := c.GetCombatants()
	output := make([]data.Combatant, 0)
	for index := range combatants {
		hasPlayer := false
		for oIndex := range output {
			if output[oIndex].Player.ID == combatants[index].Player.ID {
				if combatants[index].Time.After(output[oIndex].Time) {
					output[oIndex] = combatants[index]
				}
				hasPlayer = true
				break
			}
		}
		if hasPlayer {
			continue
		}
		combatants[index].EncounterUID = c.encounterUID
		output = append(output, combatants[index])
	}
	return output
}

// GetLastCombatantsSince - get last combatants updates since given time
func (c *CombatantManager) GetLastCombatantsSince(since time.Time) []data.Combatant {
	combatants := c.GetCombatants()
	output := make([]data.Combatant, 0)
	for index := range combatants {
		if combatants[index].Time.After(since) {
			output = append(output, combatants[index])
		}
	}
	return output
}

// GetLastUpdate - get last combatant update time
func (c *CombatantManager) GetLastUpdate() time.Time {
	return c.lastUpdate
}

// SetCombatants - set combatants
func (c *CombatantManager) SetCombatants(combatants []data.Combatant) {
	c.Reset()
	for index := range combatants {
		c.encounterUID = combatants[index].EncounterUID
		c.combatants = append(c.combatants, &combatants[index])
	}
}

// combatantAdd - add the values of two combatants together
func combatantAdd(c1 data.Combatant, c2 data.Combatant) data.Combatant {
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
func combatantSub(c1 data.Combatant, c2 data.Combatant) data.Combatant {
	c1.Damage -= c2.Damage
	c1.DamageHealed -= c2.DamageHealed
	c1.DamageTaken -= c2.DamageTaken
	c1.Deaths -= c2.Deaths
	c1.Heals -= c2.Heals
	c1.Hits -= c2.Hits
	c1.Kills -= c2.Kills
	return c1
}
