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

// DataTypeEncounter - Data type, encounter data
const DataTypeEncounter byte = 2

// Encounter - Data about an encounter
type Encounter struct {
	ByteEncodable
	UserID       int64     `json:"user_id"`
	UID          string    `json:"uid" gorm:"primary key;unique;not null;type:varchar(32)"`
	ActID        uint32    `json:"act_id"`
	CompareHash  string    `json:"compare_hash" gorm:"not null;type:varchar(32)"`
	StartTime    time.Time `json:"start_time"`
	EndTime      time.Time `json:"end_time"`
	Zone         string    `json:"zone" gorm:"type:varchar(256)"`
	Damage       int32     `json:"damage"`
	Active       bool      `json:"active"`
	SuccessLevel uint8     `json:"success_level"`
}

// ToBytes - Convert to bytes
func (e *Encounter) ToBytes() []byte {
	data := make([]byte, 1)
	data[0] = DataTypeEncounter
	writeString(&data, e.UID)
	writeTime(&data, e.StartTime)
	writeTime(&data, e.EndTime)
	writeString(&data, e.Zone)
	writeInt32(&data, e.Damage)
	writeBool(&data, e.Active)
	writeByte(&data, e.SuccessLevel)
	return data
}

// FromActBytes - Convert act bytes to encounter
func (e *Encounter) FromActBytes(data []byte) error {
	if data[0] != DataTypeEncounter {
		return errors.New("invalid data type for Encounter")
	}
	pos := 1
	e.ActID = readUint32(data, &pos)
	e.StartTime = readTime(data, &pos)
	e.EndTime = readTime(data, &pos)
	e.Zone = readString(data, &pos)
	e.Damage = readInt32(data, &pos)
	e.Active = (readByte(data, &pos) != 0)
	e.SuccessLevel = readByte(data, &pos)
	return nil
}

// FromBytes - Convert bytes to encounter
func (e *Encounter) FromBytes(data []byte) error {
	if data[0] != DataTypeEncounter {
		return errors.New("invalid data type for Encounter")
	}
	pos := 1
	e.UID = readString(data, &pos)
	e.StartTime = readTime(data, &pos)
	e.EndTime = readTime(data, &pos)
	e.Zone = readString(data, &pos)
	e.Damage = readInt32(data, &pos)
	e.Active = (readByte(data, &pos) != 0)
	e.SuccessLevel = readByte(data, &pos)
	return nil
}
