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

import "errors"

// DataTypeFlag - Data type, boolean flag
const DataTypeFlag byte = 99

// Flag - Boolean flag with name
type Flag struct {
	ByteEncodable
	Name  string
	Value bool
}

// ToBytes - Convert to bytes
func (f *Flag) ToBytes() []byte {
	data := make([]byte, 1)
	data[0] = DataTypeFlag
	writeString(&data, f.Name)
	writeBool(&data, f.Value)
	return data
}

// FromActBytes - Convert act bytes to flag
func (f *Flag) FromActBytes(data []byte) error {
	if data[0] != DataTypeFlag {
		return errors.New("invalid data type for Flag")
	}
	pos := 1
	f.Name = readString(data, &pos)
	f.Value = (readByte(data, &pos) != 0)
	return nil
}

// FromBytes - Convert bytes to flag
func (f *Flag) FromBytes(data []byte) error {
	// unused
	return nil
}
