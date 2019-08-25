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
	"net"
	"time"

	"../app"
)

// DataTypeSession - Data type, session data
const DataTypeSession byte = 1

// Session - Data about a specific session
type Session struct {
	ByteEncodable
	UploadKey string
	IP        net.IP
	Port      int
	Created   time.Time
}

// ToBytes - Convert to bytes
func (s *Session) ToBytes() []byte {
	// ununsed
	return []byte{}
}

// FromBytes - Convert bytes to session
func (s *Session) FromBytes(data []byte) error {
	if data[0] != DataTypeSession {
		return errors.New("invalid data type for Session")
	}
	pos := 1
	// check version number
	versionNumber := readInt32(data, &pos)
	if versionNumber < app.ActPluginMinVersionNumber || versionNumber > app.ActPluginMaxVersionNumber {
		return errors.New("version number mismatch")
	}
	s.UploadKey = readString(data, &pos)
	return nil
}

// SetAddress - Set network address for session
func (s *Session) SetAddress(addr *net.UDPAddr) {
	if addr == nil {
		return
	}
	s.IP = addr.IP
	s.Port = addr.Port
}
