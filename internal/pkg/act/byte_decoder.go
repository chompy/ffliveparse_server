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
	"bytes"
	"compress/gzip"
	"encoding/binary"
	"errors"
	"time"
)

func readUint16(data []byte, pos *int) uint16 {
	if len(data)-*pos < 2 {
		return 0
	}
	dataString := data[*pos : *pos+2]
	*pos += 2
	return binary.BigEndian.Uint16(dataString)
}

func readUint32(data []byte, pos *int) uint32 {
	if len(data)-*pos < 4 {
		return 0
	}
	dataString := data[*pos : *pos+4]
	*pos += 4
	return binary.BigEndian.Uint32(dataString)
}

func readInt32(data []byte, pos *int) int32 {
	return int32(readUint32(data, pos))
}

func readByte(data []byte, pos *int) byte {
	if len(data)-*pos < 1 {
		return 0
	}
	output := data[*pos]
	*pos++
	return output
}

func readString(data []byte, pos *int) string {
	length := int(readUint16(data, pos))
	if length == 0 || len(data)-*pos < length {
		return ""
	}
	output := string(data[*pos : *pos+length])
	*pos += length
	return output
}

func readTime(data []byte, pos *int) time.Time {
	timeString := readString(data, pos)
	time, _ := time.Parse(time.RFC3339, timeString)
	return time
}

// DecompressBytes - Decompress byte array for recieving
func DecompressBytes(data []byte) ([]byte, error) {
	r := bytes.NewReader(data)
	gz, err := gzip.NewReader(r)
	defer gz.Close()
	var output bytes.Buffer
	_, err = output.ReadFrom(gz)
	if err != nil {
		return nil, err
	}
	return output.Bytes(), nil
}

// DecodeLogLineBytesFile - Create LogLine struct from data stored in log file
func DecodeLogLineBytesFile(data []byte) ([]LogLine, int, error) {
	// should be compressed
	logBytes, err := DecompressBytes(data)
	if err != nil {
		return nil, 0, err
	}
	// itterate log bytes and convert to log line
	pos := 0
	logLines := make([]LogLine, 0)
	for pos < len(logBytes) {
		// check 'type' byte
		if logBytes[pos] != DataTypeLogLine {
			return nil, 0, errors.New("invalid data type for LogLine")
		}
		// read data
		pos = pos + 1
		encounterUID := readString(logBytes, &pos)
		time := readTime(logBytes, &pos)
		logLineString := readString(logBytes, &pos)
		// append to log lines array
		logLines = append(
			logLines,
			LogLine{
				EncounterUID: encounterUID,
				Time:         time,
				LogLine:      logLineString,
			},
		)
	}
	return logLines, pos, nil
}
