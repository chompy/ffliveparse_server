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
	"fmt"
	"os"
	"path"
	"time"
)

// Buffer - data buffer
type Buffer struct {
	buffer     []ByteEncodable
	userIDHash string
	lock       bool
}

// NewBuffer - create new data buffer
func NewBuffer(user *User) Buffer {
	userIDHash, _ := user.GetWebIDString()
	d := Buffer{
		userIDHash: userIDHash,
	}
	d.Reset()
	return d
}

func (d *Buffer) unlock() {
	d.lock = false
}

// Reset - reset buffer for new encounter
func (d *Buffer) Reset() {
	d.buffer = make([]ByteEncodable, 0)
	os.Remove(d.GetDumpPath())
}

// GetDumpPath - temp file path to dump data to
func (d *Buffer) GetDumpPath() string {
	return path.Join(os.TempDir(), fmt.Sprintf("fflp_%s.dat", d.userIDHash))
}

// Add - add byte encodable data to buffer
func (d *Buffer) Add(data ByteEncodable) {
	for d.lock {
		time.Sleep(time.Millisecond)
	}
	d.lock = true
	defer d.unlock()
	d.buffer = append(d.buffer, data)
}

// Dump - pop data and dump to file
func (d *Buffer) Dump() ([]ByteEncodable, error) {
	for d.lock {
		time.Sleep(time.Millisecond)
	}
	d.lock = true
	defer d.unlock()
	popData := make([]ByteEncodable, len(d.buffer))
	dumpFile, err := os.OpenFile(d.GetDumpPath(), os.O_CREATE|os.O_APPEND|os.O_WRONLY, 0644)
	if err != nil {
		return popData, err
	}
	defer dumpFile.Close()
	for index := range d.buffer {
		popData[index] = d.buffer[index]
		_, err = dumpFile.Write(d.buffer[index].ToBytes())
		if err != nil {
			return nil, err
		}
	}
	d.buffer = make([]ByteEncodable, 0)
	return popData, nil
}

// GetReadFile - get file object to read dump data from
func (d *Buffer) GetReadFile() (*os.File, error) {
	for d.lock {
		time.Sleep(time.Millisecond)
	}
	return os.OpenFile(d.GetDumpPath(), os.O_RDONLY, 0644)
}
