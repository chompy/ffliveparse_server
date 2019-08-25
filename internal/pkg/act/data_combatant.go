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
	"errors"
	"time"
)

// DataTypeCombatant - Data type, combatant data
const DataTypeCombatant byte = 3

// DataTypeCombatantSnapshots - Data type, snapshots of combatant data throughout fight
const DataTypeCombatantSnapshots byte = 6

// Combatant - Data about a combatant
type Combatant struct {
	ByteEncodable
	Player         Player    `json:"player"`
	EncounterUID   string    `json:"encounter_uid"`
	ActEncounterID uint32    `json:"act_encounter_id"`
	Time           time.Time `json:"time"`
	Job            string    `json:"job"`
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

// CombatantsToBytes - Convert multiple combatants (assumed same player) to bytes
func CombatantsToBytes(value *[]Combatant) []byte {
	data := make([]byte, 1)
	data[0] = DataTypeCombatant
	cb := *value
	writeString(&data, cb[0].EncounterUID)
	writeInt32(&data, cb[0].Player.ID)
	writeString(&data, cb[0].Player.Name)
	writeString(&data, cb[0].Player.World)
	writeString(&data, cb[0].Job)
	writeInt32(&data, int32(len(cb)))
	for index := range cb {
		writeInt32(&data, cb[index].Damage)
		writeInt32(&data, cb[index].DamageTaken)
		writeInt32(&data, cb[index].DamageHealed)
		writeInt32(&data, cb[index].Deaths)
		writeInt32(&data, cb[index].Hits)
		writeInt32(&data, cb[index].Heals)
		writeInt32(&data, cb[index].Kills)
		writeTime(&data, cb[index].Time)
	}
	return data
}

// FromBytes - Convert bytes to combatant
func (c *Combatant) FromBytes(data []byte) error {
	if data[0] != DataTypeCombatant {
		return errors.New("invalid data type for Combatant")
	}
	pos := 1
	actEncounterID := readUint32(data, &pos)
	c.Player = Player{
		ID:   readInt32(data, &pos),
		Name: readString(data, &pos),
	}
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
