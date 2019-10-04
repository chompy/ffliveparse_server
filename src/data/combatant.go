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

package data

import (
	"errors"
	"time"
)

// DataTypeCombatant - Data type, combatant data
const DataTypeCombatant byte = 3

// Combatant - Data about a combatant
type Combatant struct {
	ByteEncodable
	ID             int64     `gorm:"primary key;unique;AUTO_INCREMENT"`
	UserID         int64     `json:"user_id"`
	PlayerID       int32     `json:"player_id"`
	Player         Player    `json:"player" gorm:"foreignkey:ID"`
	EncounterUID   string    `json:"encounter_uid" gorm:"type:varchar(32)"`
	ActEncounterID uint32    `json:"act_encounter_id"`
	Time           time.Time `json:"time"`
	Job            string    `json:"job" gorm:"type:varchar(3)"`
	Damage         int32     `json:"damage"`
	DamageTaken    int32     `json:"damage_taken"`
	DamageHealed   int32     `json:"damage_healed"`
	Deaths         int32     `json:"deaths"`
	Hits           int32     `json:"hits"`
	Heals          int32     `json:"heals"`
	Kills          int32     `json:"kills"`
}

// ToBytes - Convert to bytes
func (c *Combatant) ToBytes() []byte {
	data := make([]byte, 1)
	data[0] = DataTypeCombatant
	writeString(&data, c.EncounterUID)
	writeInt32(&data, c.Player.ID)
	writeString(&data, c.Player.Name)
	writeString(&data, c.Player.World)
	writeString(&data, c.Job)
	writeInt32(&data, c.Damage)
	writeInt32(&data, c.DamageTaken)
	writeInt32(&data, c.DamageHealed)
	writeInt32(&data, c.Deaths)
	writeInt32(&data, c.Hits)
	writeInt32(&data, c.Heals)
	writeInt32(&data, c.Kills)
	writeTime(&data, c.Time)
	return data
}

// FromActBytes - Convert act bytes to combatant
func (c *Combatant) FromActBytes(data []byte) error {
	if data[0] != DataTypeCombatant {
		return errors.New("invalid data type for Combatant")
	}
	pos := 1
	actEncounterID := readUint32(data, &pos)
	c.Player = Player{
		ID:   readInt32(data, &pos),
		Name: readString(data, &pos),
	}
	c.PlayerID = c.Player.ID
	c.Player.ActName = c.Player.Name
	c.ActEncounterID = actEncounterID
	c.Job = readString(data, &pos)
	c.Damage = readInt32(data, &pos)
	c.DamageTaken = readInt32(data, &pos)
	c.DamageHealed = readInt32(data, &pos)
	c.Deaths = readInt32(data, &pos)
	c.Hits = readInt32(data, &pos)
	c.Heals = readInt32(data, &pos)
	c.Kills = readInt32(data, &pos)
	c.Time = time.Now()
	return nil
}

// FromBytes - Convert bytes to combatant
func (c *Combatant) FromBytes(data []byte) error {
	if data[0] != DataTypeCombatant {
		return errors.New("invalid data type for Combatant")
	}
	pos := 1
	c.EncounterUID = readString(data, &pos)
	playerID := readInt32(data, &pos)
	playerName := readString(data, &pos)
	playerWorld := readString(data, &pos)
	c.Player = Player{
		ID:    playerID,
		Name:  playerName,
		World: playerWorld,
	}
	c.PlayerID = playerID
	c.Job = readString(data, &pos)
	c.Damage = readInt32(data, &pos)
	c.DamageTaken = readInt32(data, &pos)
	c.DamageHealed = readInt32(data, &pos)
	c.Deaths = readInt32(data, &pos)
	c.Hits = readInt32(data, &pos)
	c.Heals = readInt32(data, &pos)
	c.Kills = readInt32(data, &pos)
	c.Time = readTime(data, &pos)
	return nil
}
