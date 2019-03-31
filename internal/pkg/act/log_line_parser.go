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
	"log"
	"regexp"
	"strconv"
	"strings"
	"time"
)

// LogTypeGameLog - Log type identifier, game logs
const LogTypeGameLog = 0x00

// LogTypeZoneChange - Log type identifier, zone change
const LogTypeZoneChange = 0x01

// LogTypeRemoveCombatant - Log type identifier, remove combatant
const LogTypeRemoveCombatant = 0x04

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

// LogTypeHPPercent - Log type identifier, HP percent of combatant
const LogTypeHPPercent = 0x1D

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
var logShiftValues = [...]int{0x3E, 0x113, 0x213, 0x313}

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
	Time            time.Time
}

// HasFlag - Check if log line data has given flag
func (l *LogLineData) HasFlag(flag int) bool {
	for _, lFlag := range l.Flags {
		if lFlag == flag {
			return true
		}
	}
	return false
}

// hexToInt - convert hex string to int
func hexToInt(hexString string) (int, error) {
	if hexString == "" {
		return 0, nil
	}
	output, err := strconv.ParseInt(hexString, 16, 64)
	return int(output), err
}

// ParseLogLine - Parse log line in to data structure
func ParseLogLine(logLine LogLine) (LogLineData, error) {
	logLineString := logLine.LogLine
	if len(logLineString) <= 15 {
		return LogLineData{}, fmt.Errorf("tried to parse log line with too few characters")
	}
	// hack, fix SAM "Hissatsu:" move as it breaks ":" delimiter
	logLineString = strings.Replace(logLineString, "Hissatsu:", "Hissatsu--", -1)
	//logLineString = strings.Replace(logLineString, )
	// split fields
	fields := strings.Split(logLineString[15:], ":")
	// get field type
	logLineType, err := hexToInt(fields[0])
	if err != nil {
		log.Print(logLineString)
		return LogLineData{}, err
	}
	// create data object
	data := LogLineData{
		Type: int(logLineType),
		Raw:  logLineString,
		Time: logLine.Time,
	}
	// parse remaining
	switch logLineType {
	case LogTypeSingleTarget, LogTypeAoe:
		{
			// ensure there are enough fields
			if len(fields) < 24 {
				return LogLineData{}, fmt.Errorf("not enough fields when parsing ability")
			}
			// Shift damage and flags forward for mysterious spurious :3E:0:.
			// Plenary Indulgence also appears to prepend confession stacks.
			// UNKNOWN: Can these two happen at the same time?
			flagsInt, err := hexToInt(fields[LogFieldFlags])
			if err != nil {
				log.Println("1", logLineString)
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
			damage := 0
			if damageFieldLength >= 4 {
				// Get the left two bytes as damage.
				damage, err = hexToInt(fields[LogFieldDamage][0:4])
				if err != nil {
					log.Println("2", logLineString)
					return data, err
				}
			}
			// Check for third byte == 0x40.
			if damageFieldLength >= 4 && fields[LogFieldDamage][damageFieldLength-4] == '4' {
				// Wrap in the 4th byte as extra damage.  See notes above.
				rightDamage, err := hexToInt(fields[LogFieldDamage][damageFieldLength-2 : damageFieldLength])
				if err != nil {
					log.Println("3", logLineString)
					return data, err
				}
				damage = damage - rightDamage + (rightDamage << 16)
			}
			data.Damage = int(damage)
			// attacker id
			attackerID, err := hexToInt(fields[LogFieldAttackerID])
			if err != nil {
				log.Println("4", logLineString)
				return data, err
			}
			data.AttackerID = int(attackerID)
			// attacker name
			data.AttackerName = fields[LogFieldAttackerName]
			// ability id
			abilityID, err := hexToInt(fields[LogFieldAbilityID])
			if err != nil {
				log.Println("5", logLineString)
				return data, err
			}
			data.AbilityID = int(abilityID)
			// ability name
			data.AbilityName = fields[LogFieldAbilityName]
			// hack, restore 'Hissatsu:'
			data.AbilityName = strings.Replace(data.AbilityName, "Hissatsu--", "Hissatsu:", -1)
			// target id
			targetID, err := hexToInt(fields[LogFieldTargetID])
			if err != nil {
				log.Println("6", logLineString)
				return data, err
			}
			data.TargetID = int(targetID)
			// target name
			data.TargetName = fields[LogFieldTargetName]
			// target current hp
			targetCurrentHP, err := hexToInt(fields[LogFieldTargetCurrentHP])
			if err != nil {
				log.Println("7", logLineString)
				return data, err
			}
			data.TargetCurrentHP = int(targetCurrentHP)
			// target max hp
			targetMaxHP, err := hexToInt(fields[LogFieldTargetMaxHP])
			if err != nil {
				log.Println("8", logLineString)
				return data, err
			}
			data.TargetMaxHP = int(targetMaxHP)
			break
		}
	case LogTypeDefeat:
		{
			re, err := regexp.Compile(" 19:([a-zA-Z0-9'\\- ]*) was defeated by ([a-zA-Z0-9'\\- ]*)")
			if err != nil {
				log.Println("9", logLineString)
				return data, err
			}
			match := re.FindStringSubmatch(logLineString)
			if len(match) <  {
				break
			}
			data.AttackerName = match[2]
			data.TargetName = match[1]
			break
		}
	case LogTypeZoneChange:
		{
			re, err := regexp.Compile(" 01:Changed Zone to (.*)\\.")
			if err != nil {
				log.Println("11", logLineString)
				return data, err
			}
			match := re.FindStringSubmatch(logLineString)
			if len(match) < 2 {
				break
			}
			// special case, target name is zone name
			data.TargetName = match[1]
			break
		}
	case LogTypeRemoveCombatant:
		{
			re, err := regexp.Compile(" 04:Removing combatant ([a-zA-Z0-9'\\- ]*)\\.  Max HP: ([0-9]*)\\.")
			if err != nil {
				log.Println("12", logLineString)
				return data, err
			}
			match := re.FindStringSubmatch(logLineString)
			if len(match) < 3 {
				break
			}
			data.TargetName = match[1]
			maxHP, err := strconv.ParseInt(match[2], 10, 64)
			if err != nil {
				log.Println("12", logLineString)
				return data, err
			}
			data.TargetMaxHP = int(maxHP)
			break
		}
	case LogTypeHPPercent:
		{
			re, err := regexp.Compile(" 0D:([A-Za-z\\-' ]*) HP at ([0-9]*)%")
			if err != nil {
				log.Println("13", logLineString)
				return data, err
			}
			match := re.FindStringSubmatch(logLineString)
			if len(match) > 2 {
				data.TargetName = match[1]
				damage, err := strconv.ParseInt(match[2], 10, 64)
				if err != nil {
					return data, err
				}
				data.Damage = int(damage)
			}
			break
		}
	case LogTypeGameLog:
		{
			// get world name from game log
			if len(fields) > 2 && fields[1] == "102b" {
				re, err := regexp.Compile("102b:([a-zA-Z'\\-]*) ([A-Z'])([a-z'\\-]*)([A-Z])([a-z]*)")
				if err != nil {
					log.Println("10", logLineString)
					return data, err
				}
				match := re.FindStringSubmatch(logLineString)
				if len(match) < 6 {
					break
				}
				attackerName := fmt.Sprintf("%s %s%s", match[1], match[2], match[3])
				worldName := fmt.Sprintf("%s%s", match[4], match[5])
				data.AttackerName = attackerName
				// special case, target name is world name
				data.TargetName = worldName
			}
			break
		}

	}

	// flags
	if len(fields) >= LogFieldFlags+1 {
		rawFlags := fields[LogFieldFlags]
		switch rawFlags[len(rawFlags)-1:] {
		case "1":
			{
				data.Flags = append(data.Flags, LogFlagDodge)
				break
			}
		case "3":
			{
				if len(rawFlags) >= 4 {
					switch rawFlags[len(rawFlags)-3 : len(rawFlags)-2] {
					case "3":
						{
							data.Flags = append(data.Flags, LogFlagInstantDeath)
							break
						}
					default:
						{
							data.Flags = append(data.Flags, LogFlagDamage)
							switch rawFlags[len(rawFlags)-4 : len(rawFlags)-3] {
							case "1":
								{
									data.Flags = append(data.Flags, LogFlagCrit)
									break
								}
							case "2":
								{
									data.Flags = append(data.Flags, LogFlagDirectHit)
									break
								}
							case "3":
								{
									data.Flags = append(data.Flags, LogFlagCrit)
									data.Flags = append(data.Flags, LogFlagDirectHit)
									break
								}
							}
							break
						}
					}
				}
				break
			}
		case "4":
			{
				data.Flags = append(data.Flags, LogFlagHeal)
				if len(rawFlags) >= 6 && rawFlags[len(rawFlags)-6:len(rawFlags)-5] == "1" {
					data.Flags = append(data.Flags, LogFlagCrit)
				}
				break
			}
		case "5":
			{
				data.Flags = append(data.Flags, LogFlagBlock)
				break
			}
		case "6":
			{
				data.Flags = append(data.Flags, LogFlagParry)
				break
			}
		}
	}

	return data, nil

}
