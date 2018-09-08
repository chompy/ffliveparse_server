package act

import (
	"encoding/binary"
	"errors"
	"net"
)

func readInt64(data []byte, pos *int) int64 {
	dataString := data[*pos : *pos+8]
	*pos += 8
	return int64(binary.BigEndian.Uint64(dataString))
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
	length := int(data[*pos])
	output := string(data[*pos+1 : *pos+1+length])
	*pos += 1 + length
	return output
}

// DecodeSessionBytes - Create Session struct from incomming data packet
func DecodeSessionBytes(data []byte, addr *net.UDPAddr) (Session, error) {
	if data[0] != DataTypeSession {
		return Session{}, errors.New("invalid data type for Session")
	}
	pos := 1
	// check version number
	versionNumber := readInt32(data, &pos)
	if versionNumber != VersionNumber {
		return Session{}, errors.New("version number mismatch")
	}
	return Session{
		ID:   readString(data, &pos),
		IP:   addr.IP,
		Port: addr.Port,
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
		StartTick:    readInt64(data, &pos),
		EndTick:      readInt64(data, &pos),
		Zone:         readString(data, &pos),
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
		Damage:       readInt64(data, &pos),
		DamageTaken:  readInt64(data, &pos),
		DamageHealed: readInt64(data, &pos),
		Deaths:       readInt32(data, &pos),
		Hits:         readInt32(data, &pos),
		Heals:        readInt32(data, &pos),
		Kills:        readInt32(data, &pos),
	}, nil
}

// DecodeCombatActionBytes - Create CombatAction struct from incomming data packet
func DecodeCombatActionBytes(data []byte) (CombatAction, error) {
	if data[0] != DataTypeCombatAction {
		return CombatAction{}, errors.New("invalid data type for CombatAction")
	}
	pos := 1
	return CombatAction{
		EncounterID: readInt32(data, &pos),
		Tick:        readInt64(data, &pos),
		Sort:        readInt32(data, &pos),
		Attacker:    readString(data, &pos),
		Victim:      readString(data, &pos),
		Damage:      readInt64(data, &pos),
		Skill:       readString(data, &pos),
		SkillType:   readString(data, &pos),
		SwingType:   readByte(data, &pos),
		Critical:    readByte(data, &pos) != 0,
	}, nil
}

// DecodeLogLineBytes - Create LogLing struct from incomming data packet
func DecodeLogLineBytes(data []byte) (LogLing, error) {
	if data[0] != DataTypeLogLine {
		return LogLing{}, errors.New("invalid data type for LogLing")
	}
	pos := 1
	encounterID := readInt32(data, &pos)
	tick := readInt64(data, &pos)
	logLineLength := readInt32(data, &pos)
	logLine := string(data[pos : pos+int(logLineLength)])
	return LogLing{
		EncounterID: encounterID,
		Tick:        tick,
		LogLine:     logLine,
	}, nil
}