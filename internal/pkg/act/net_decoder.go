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
	"net"
	"time"

	"../app"
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

// DecodeSessionBytes - Create Session struct from incomming data packet
func DecodeSessionBytes(data []byte, addr *net.UDPAddr) (Session, int, error) {
	if data[0] != DataTypeSession {
		return Session{}, 0, errors.New("invalid data type for Session")
	}
	pos := 1
	// check version number
	versionNumber := readInt32(data, &pos)
	if versionNumber < app.ActPluginMinVersionNumber || versionNumber > app.ActPluginMaxVersionNumber {
		return Session{}, 0, errors.New("version number mismatch")
	}
	return Session{
		UploadKey: readString(data, &pos),
		IP:        addr.IP,
		Port:      addr.Port,
	}, pos, nil
}

// DecodeEncounterBytes - Create Encounter struct from incomming data packet
func DecodeEncounterBytes(data []byte) (Encounter, int, error) {
	if data[0] != DataTypeEncounter {
		return Encounter{}, 0, errors.New("invalid data type for Encounter")
	}
	pos := 1
	return Encounter{
		ActID:        readUint32(data, &pos),
		StartTime:    readTime(data, &pos),
		EndTime:      readTime(data, &pos),
		Zone:         readString(data, &pos),
		Damage:       readInt32(data, &pos),
		Active:       readByte(data, &pos) != 0,
		SuccessLevel: readByte(data, &pos),
	}, pos, nil
}

// DecodeCombatantBytes - Create Combatant struct from incomming data packet
func DecodeCombatantBytes(data []byte) (Combatant, int, error) {
	if data[0] != DataTypeCombatant {
		return Combatant{}, 0, errors.New("invalid data type for Combatant")
	}
	pos := 1
	actEncounterID := readUint32(data, &pos)
	p := Player{
		ID:   readInt32(data, &pos),
		Name: readString(data, &pos),
	}
	p.ActName = p.Name
	c := Combatant{
		Player:         p,
		ActEncounterID: actEncounterID,
		Job:            readString(data, &pos),
		Damage:         readInt32(data, &pos),
		DamageTaken:    readInt32(data, &pos),
		DamageHealed:   readInt32(data, &pos),
		Deaths:         readInt32(data, &pos),
		Hits:           readInt32(data, &pos),
		Heals:          readInt32(data, &pos),
		Kills:          readInt32(data, &pos),
		Time:           time.Now(),
	}
	return c, pos, nil
}

// DecodeLogLineBytes - Create LogLine struct from incomming data packet
func DecodeLogLineBytes(data []byte) (LogLine, int, error) {
	if data[0] != DataTypeLogLine {
		return LogLine{}, 0, errors.New("invalid data type for LogLine")
	}
	pos := 1
	encounterID := readUint32(data, &pos)
	time := readTime(data, &pos)
	logLine := readString(data, &pos)
	return LogLine{
		ActEncounterID: encounterID,
		Time:           time,
		LogLine:        logLine,
	}, pos, nil
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
