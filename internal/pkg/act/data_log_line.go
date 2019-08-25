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

// DataTypeLogLine - Data type, log line
const DataTypeLogLine byte = 5

// LogLine - Log line from Act
type LogLine struct {
	ByteEncodable
	EncounterUID   string
	ActEncounterID uint32
	Time           time.Time
	LogLine        string
}

// ToBytes - Convert to bytes
func (l *LogLine) ToBytes() []byte {
	data := make([]byte, 1)
	data[0] = DataTypeLogLine
	return data
}

// FromBytes - Convert bytes to log line
func (l *LogLine) FromBytes(data []byte) error {
	if data[0] != DataTypeLogLine {
		return errors.New("invalid data type for LogLine")
	}
	pos := 1
	l.ActEncounterID = readUint32(data, &pos)
	l.Time = readTime(data, &pos)
	l.LogLine = readString(data, &pos)
	return nil
}
