package act

import (
	"encoding/binary"
	"errors"
	"net"
	"time"

	"../app"
)

func readUint16(data []byte, pos *int) uint16 {
	dataString := data[*pos : *pos+2]
	*pos += 2
	return binary.BigEndian.Uint16(dataString)
}

func readInt32(data []byte, pos *int) int32 {
	dataString := data[*pos : *pos+4]
	*pos += 4
	return int32(binary.BigEndian.Uint32(dataString))
}

func readByte(data []byte, pos *int) byte {
	output := data[*pos]
	*pos++
	return output
}

func readString(data []byte, pos *int) string {
	length := int(readUint16(data, pos))
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
func DecodeSessionBytes(data []byte, addr *net.UDPAddr) (Session, error) {
	if data[0] != DataTypeSession {
		return Session{}, errors.New("invalid data type for Session")
	}
	pos := 1
	// check version number
	versionNumber := readInt32(data, &pos)
	if versionNumber != app.ActPluginVersionNumber {
		return Session{}, errors.New("version number mismatch")
	}
	return Session{
		UploadKey: readString(data, &pos),
		IP:        addr.IP,
		Port:      addr.Port,
	}, nil
}

// DecodeEncounterBytes - Create Encounter struct from incomming data packet
func DecodeEncounterBytes(data []byte) (Encounter, error) {
	if data[0] != DataTypeEncounter {
		return Encounter{}, errors.New("invalid data type for Encounter")
	}
	pos := 1
	return Encounter{
		ID:           readInt32(data, &pos),
		StartTime:    readTime(data, &pos),
		EndTime:      readTime(data, &pos),
		Zone:         readString(data, &pos),
		Damage:       readInt32(data, &pos),
		Active:       readByte(data, &pos) != 0,
		SuccessLevel: readByte(data, &pos),
	}, nil
}

// DecodeCombatantBytes - Create Combatant struct from incomming data packet
func DecodeCombatantBytes(data []byte) (Combatant, error) {
	if data[0] != DataTypeCombatant {
		return Combatant{}, errors.New("invalid data type for Combatant")
	}
	pos := 1
	return Combatant{
		EncounterID:  readInt32(data, &pos),
		Name:         readString(data, &pos),
		Job:          readString(data, &pos),
		Damage:       readInt32(data, &pos),
		DamageTaken:  readInt32(data, &pos),
		DamageHealed: readInt32(data, &pos),
		Deaths:       readInt32(data, &pos),
		Hits:         readInt32(data, &pos),
		Heals:        readInt32(data, &pos),
		Kills:        readInt32(data, &pos),
	}, nil
}

// DecodeLogLineBytes - Create LogLine struct from incomming data packet
func DecodeLogLineBytes(data []byte) (LogLine, error) {
	if data[0] != DataTypeLogLine {
		return LogLine{}, errors.New("invalid data type for LogLine")
	}
	pos := 1
	encounterID := readInt32(data, &pos)
	time := readTime(data, &pos)
	logLine := readString(data, &pos)
	return LogLine{
		EncounterID: encounterID,
		Time:        time,
		LogLine:     logLine,
	}, nil
}
