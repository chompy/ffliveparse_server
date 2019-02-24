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
	"fmt"
	"strconv"
	"strings"
)

// LogTypeGameLog - Log type identifier, game logs
const LogTypeGameLog = 0x00

// LogTypeZoneChange - Log type identifier, zone change
const LogTypeZoneChange = 0x01

// LogTypeSingleTarget - Log type identifier, single target action
const LogTypeSingleTarget = 0x15

// LogTypeAoe - Log type identifier, aoe action
const LogTypeAoe = 0x16

// LogTypeDot - Log type identifier, dot/hot tick
const LogTypeDot = 0x18

// LogTypeDefeat - Log type identifier, defeated
const LogTypeDefeat = 0x19

// LogTypeGainEffect - Log type identifier, gained effect
const LogTypeGainEffect = 0x1A

// LogTypeLoseEffect - Log type identifier, lose effect
const LogTypeLoseEffect = 0x1E

// LogFieldType - Log field indentifier, message type
const LogFieldType = 0

// LogFieldAttackerID - Log field indentifier, attacker id
const LogFieldAttackerID = 1

// LogFieldAttackerName - Log field indentifier, attacker name
const LogFieldAttackerName = 2

// LogFieldAbilityID - Log field indentifier, ability id
const LogFieldAbilityID = 3

// LogFieldAbilityName - Log field indentifier, ability name
const LogFieldAbilityName = 4

// LogFieldTargetID - Log field indentifier, target id
const LogFieldTargetID = 5

// LogFieldTargetName - Log field indentifier, target name
const LogFieldTargetName = 6

// LogFieldFlags - Log field indentifier, flags
const LogFieldFlags = 7

// LogFieldDamage - Log field indentifier, damage
const LogFieldDamage = 8

// LogFieldTargetCurrentHP - Log field indentifier, target current hp
const LogFieldTargetCurrentHP = 23

// LogFieldTargetMaxHP - Log field indentifier, target max hp
const LogFieldTargetMaxHP = 24

// LogFlagDamage - Log flag, damage
const LogFlagDamage = 1

// LogFlagHeal - Log flag, heal
const LogFlagHeal = 2

// LogFlagCrit - Log flag, critical hit
const LogFlagCrit = 3

// LogFlagDirectHit - Log flag, direct hit
const LogFlagDirectHit = 4

// LogFlagDodge - Log flag, doge
const LogFlagDodge = 5

// LogFlagBlock - Log flag, block
const LogFlagBlock = 6

// LogFlagParry - Log flag, parry
const LogFlagParry = 7

// LogFlagInstantDeath - Log flag, instant death
const LogFlagInstantDeath = 8

// logShiftValues
var logShiftValues = [...]int64{0x3E, 0x113, 0x213, 0x313}

// LogLineData - Data retrieved by parsing a log line
type LogLineData struct {
	Type            int
	Raw             string
	AttackerID      int
	AttackerName    string
	AbilityID       int
	AbilityName     string
	TargetID        int
	TargetName      string
	Flags           []int
	Damage          int
	TargetCurrentHP int
	TargetMaxHP     int
}

// ParseLogLine - Parse log line in to data structure
func ParseLogLine(logLineString string) (LogLineData, error) {
	if len(logLineString) <= 15 {
		return LogLineData{}, fmt.Errorf("tried to parse log line with too few characters")
	}
	// split fields
	fields := strings.Split(logLineString[15:], ":")
	// get field type
	logLineType, err := strconv.ParseInt(fields[0], 16, 8)
	if err != nil {
		return LogLineData{}, err
	}
	// create data object
	data := LogLineData{
		Type: int(logLineType),
		Raw:  logLineString,
	}
	// parse remaining
	switch logLineType {
	case LogTypeSingleTarget:
	case LogTypeAoe:
		{
			// ensure there are enough fields
			if len(fields) < 24 {
				return LogLineData{}, fmt.Errorf("not enough fields when parsing ability")
			}
			// Shift damage and flags forward for mysterious spurious :3E:0:.
			// Plenary Indulgence also appears to prepend confession stacks.
			// UNKNOWN: Can these two happen at the same time?
			flagsInt, err := strconv.ParseInt(fields[LogFieldFlags], 16, 64)
			if err != nil {
				return data, err
			}
			for _, shiftValue := range logShiftValues {
				if flagsInt == shiftValue {
					fields[LogFieldFlags] = fields[LogFieldFlags+2]
					fields[LogFieldFlags+1] = fields[LogFieldFlags+3]
					break
				}
			}
			// fetch damage value
			damageFieldLength := len(fields[LogFieldDamage])
			if damageFieldLength <= 4 {
				return data, fmt.Errorf("could not parse damage value")
			}
			// Get the left two bytes as damage.
			damage, err := strconv.ParseInt(fields[LogFieldDamage][0:4], 16, 16)
			if err != nil {
				return data, err
			}
			// Check for third byte == 0x40.
			if fields[LogFieldDamage][damageFieldLength-4] == '4' {
				// Wrap in the 4th byte as extra damage.  See notes above.
				rightDamage, err := strconv.ParseInt(fields[LogFieldDamage][damageFieldLength-2:damageFieldLength], 16, 32)
				if err != nil {
					return data, err
				}
				damage = damage - rightDamage + (rightDamage << 16)
			}
			data.Damage = int(damage)
			// attacker id
			attackerID, err := strconv.ParseInt(fields[LogFieldAttackerID], 16, 32)
			if err != nil {
				return data, err
			}
			data.AttackerID = int(attackerID)
			// attacker name
			data.AttackerName = fields[LogFieldAttackerName]
			// ability id
			abilityID, err := strconv.ParseInt(fields[LogFieldAbilityID], 16, 32)
			if err != nil {
				return data, err
			}
			data.AbilityID = int(abilityID)
			// ability name
			data.AbilityName = fields[LogFieldAbilityName]
			// target id
			targetID, err := strconv.ParseInt(fields[LogFieldTargetID], 16, 32)
			if err != nil {
				return data, err
			}
			data.TargetID = int(targetID)
			// target name
			data.TargetName = fields[LogFieldTargetName]
			// target current hp
			targetCurrentHP, err := strconv.ParseInt(fields[LogFieldTargetCurrentHP], 16, 32)
			if err != nil {
				return data, err
			}
			data.TargetCurrentHP = int(targetCurrentHP)
			// target max hp
			targetMaxHP, err := strconv.ParseInt(fields[LogFieldTargetMaxHP], 16, 32)
			if err != nil {
				return data, err
			}
			data.TargetMaxHP = int(targetMaxHP)
			break
		}
	}

	return data, nil

}
