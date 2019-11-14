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

package session

import (
	"fmt"
	"log"
	"regexp"
	"runtime"
	"strconv"
	"strings"
	"time"

	"../data"
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
const LogTypeHPPercent = 0x0D

// LogTypeFFLPCombatant - Log type identifier, custom combatant data
const LogTypeFFLPCombatant = 0x99

// LogFieldType - Log field identifier, message type
const LogFieldType = 0

// LogFieldAttackerID - Log field identifier, attacker id
const LogFieldAttackerID = 1

// LogFieldAttackerName - Log field identifier, attacker name
const LogFieldAttackerName = 2

// LogFieldAbilityID - Log field identifier, ability id
const LogFieldAbilityID = 3

// LogFieldAbilityName - Log field identifier, ability name
const LogFieldAbilityName = 4

// LogFieldTargetID - Log field identifier, target id
const LogFieldTargetID = 5

// LogFieldTargetName - Log field identifier, target name
const LogFieldTargetName = 6

// LogFieldFlags - Log field identifier, flags
const LogFieldFlags = 7

// LogFieldDamage - Log field identifier, damage
const LogFieldDamage = 8

// LogFieldTargetCurrentHP - Log field identifier, target current hp
const LogFieldTargetCurrentHP = 23

// LogFieldTargetMaxHP - Log field identifier, target max hp
const LogFieldTargetMaxHP = 24

// LogFieldAttackerCurrentHP - Log field identifier, attacker current hp
const LogFieldAttackerCurrentHP = 33

// LogFieldAttackerMaxHP - Log field identifier, attacker max hp
const LogFieldAttackerMaxHP = 34

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

// LogMsgIDCharacterWorldName - Log message ID for message with character world name
const LogMsgIDCharacterWorldName = 0x102b

// LogMsgIDObtainItem - Log message ID for message about obtaining item
const LogMsgIDObtainItem = 0x083e

// LogMsgIDCompletionTime - Log message ID for message about encounter completion
const LogMsgIDCompletionTime = 0x0840

// LogMsgIDCastLot - Log message ID for message about casting lot on loot
const LogMsgIDCastLot = 0x0839

// LogMsgIDEcho - Log message ID for echo messages
const LogMsgIDEcho = 0x0038

// LogMsgChatID - Log message IDs less then this value are considered chat messages and can be ignored
const LogMsgChatID = 0x00FF

// LogMsgPopUpBubble - Log mesage ID for popup text bubble during encounter.
const LogMsgPopUpBubble = 0x0044

// LogMsgIDCountdown - Log message IDs for countdown
var LogMsgIDCountdown = [...]int{0x0039, 0x00b9, 0x0139}

// logShiftValues
var logShiftValues = [...]int{0x3E, 0x113, 0x213, 0x313}

// ParsedLogLine - Data retrieved by parsing a log line
type ParsedLogLine struct {
	Type              int
	GameLogType       int
	Raw               string
	AttackerID        int
	AttackerName      string
	AbilityID         int
	AbilityName       string
	TargetID          int
	TargetName        string
	Flags             []int
	Damage            int
	AttackerCurrentHP int
	AttackerMaxHP     int
	TargetCurrentHP   int
	TargetMaxHP       int
	Time              time.Time
}

// HasFlag - Check if log line data has given flag
func (l *ParsedLogLine) HasFlag(flag int) bool {
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
	if err != nil {
		_, fn, line, _ := runtime.Caller(1)
		log.Println(hexString, fn, line)
	}
	return int(output), err
}

// ParseLogLine - Parse log line in to data structure
func ParseLogLine(logLine data.LogLine) (ParsedLogLine, error) {
	logLineString := logLine.LogLine
	if len(logLineString) <= 15 {
		return ParsedLogLine{}, fmt.Errorf("tried to parse log line with too few characters")
	}
	// get field type
	logLineType, err := hexToInt(logLineString[15:17])
	if err != nil {
		log.Print(logLineString)
		return ParsedLogLine{}, err
	}
	// semi colon with space afterwards is ability name instead of delimiter
	// probably........... examples... Kaeshi: Higanbana, Hissatsu: Guren
	logLineString = strings.Replace(logLineString, ": ", "####", -1)
	// split fields
	fields := strings.Split(logLineString[15:], ":")
	// create data object
	data := ParsedLogLine{
		Type: int(logLineType),
		Raw:  strings.Replace(logLineString, "####", ": ", -1),
		Time: logLine.Time,
	}
	// parse remaining
	switch logLineType {
	case LogTypeSingleTarget, LogTypeAoe:
		{
			// ensure there are enough fields
			if len(fields) < 24 {
				return ParsedLogLine{}, fmt.Errorf("not enough fields when parsing ability")
			}
			// Shift damage and flags forward for mysterious spurious :3E:0:.
			// Plenary Indulgence also appears to prepend confession stacks.
			// UNKNOWN: Can these two happen at the same time?
			flagsInt, err := hexToInt(fields[LogFieldFlags])
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
			damage := 0
			if damageFieldLength >= 4 {
				// Get the left four bytes as damage.
				damage, err = hexToInt(fields[LogFieldDamage][0:4])
				if err != nil {
					return data, err
				}
			}
			// Check for third byte == 0x40.
			if damageFieldLength >= 4 && fields[LogFieldDamage][damageFieldLength-4] == '4' {
				// Wrap in the 4th byte as extra damage.  See notes above.
				rightDamage, err := hexToInt(fields[LogFieldDamage][damageFieldLength-2 : damageFieldLength])
				if err != nil {
					return data, err
				}
				damage = damage - rightDamage + (rightDamage << 16)
			}
			data.Damage = int(damage)
			// attacker id
			attackerID, err := hexToInt(fields[LogFieldAttackerID])
			if err != nil {
				return data, err
			}
			data.AttackerID = int(attackerID)
			// attacker name
			data.AttackerName = fields[LogFieldAttackerName]
			// ability id
			abilityID, err := hexToInt(fields[LogFieldAbilityID])
			if err != nil {
				return data, err
			}
			data.AbilityID = int(abilityID)
			// ability name
			data.AbilityName = fields[LogFieldAbilityName]
			// restore ability name with semicolon
			data.AbilityName = strings.Replace(data.AbilityName, "####", ": ", -1)
			// target id
			targetID, err := hexToInt(fields[LogFieldTargetID])
			if err != nil {
				return data, err
			}
			data.TargetID = int(targetID)
			// target name
			data.TargetName = fields[LogFieldTargetName]
			// target current hp
			if len(fields)-1 >= LogFieldTargetCurrentHP && fields[LogFieldTargetCurrentHP] != "" {
				targetCurrentHP, err := hexToInt(fields[LogFieldTargetCurrentHP])
				if err != nil {
					return data, err
				}
				data.TargetCurrentHP = int(targetCurrentHP)
			}
			// target max hp
			if len(fields)-1 >= LogFieldTargetMaxHP && fields[LogFieldTargetMaxHP] != "" {
				targetMaxHP, err := hexToInt(fields[LogFieldTargetMaxHP])
				if err != nil {
					return data, err
				}
				data.TargetMaxHP = int(targetMaxHP)
			}
			// attacker current hp
			if len(fields)-1 >= LogFieldAttackerCurrentHP && fields[LogFieldAttackerCurrentHP] != "" {
				attackerCurrentHP, err := hexToInt(fields[LogFieldAttackerCurrentHP])
				if err != nil {
					return data, err
				}
				data.AttackerCurrentHP = int(attackerCurrentHP)
			}
			// target max hp
			if len(fields)-1 >= LogFieldAttackerMaxHP && fields[LogFieldAttackerMaxHP] != "" {
				attackerMaxHP, err := hexToInt(fields[LogFieldAttackerMaxHP])
				if err != nil {
					return data, err
				}
				data.AttackerMaxHP = int(attackerMaxHP)
			}
			break
		}
	case LogTypeDefeat:
		{
			re, err := regexp.Compile(" 19:([a-zA-Z0-9'\\- ]*) was defeated by ([a-zA-Z0-9'\\- ]*)")
			if err != nil {
				return data, err
			}
			match := re.FindStringSubmatch(logLineString)
			if len(match) < 3 {
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
				return data, err
			}
			match := re.FindStringSubmatch(logLineString)
			if len(match) < 2 {
				break
			}
			// special case, target name is zone name
			data.TargetName = strings.Replace(match[1], "####", ": ", -1)
			break
		}
	case LogTypeRemoveCombatant:
		{
			// remember...we replace ': ' with '####'
			re, err := regexp.Compile(" 04:([A-F0-9]*):Removing combatant ([a-zA-Z0-9'\\- ]*)\\.  Max HP####([0-9]*)\\.")
			if err != nil {
				return data, err
			}
			match := re.FindStringSubmatch(logLineString)
			if len(match) < 4 {
				break
			}
			targetID, err := hexToInt(match[1])
			if err != nil {
				return data, err
			}
			data.TargetID = targetID
			data.TargetName = match[2]
			maxHP, err := hexToInt(match[3])
			if err != nil {
				return data, err
			}
			data.TargetMaxHP = int(maxHP)
			break
		}
	case LogTypeHPPercent:
		{
			// ignore these messages
			data.Raw = ""
			break
		}
	case LogTypeGameLog:
		{
			if len(fields) <= 2 {
				break
			}
			// get Log message ID
			gameLogType, err := hexToInt(fields[1])
			if err != nil {
				return data, err
			}
			data.GameLogType = int(gameLogType)
			// player chat message, ignore
			if data.GameLogType <= LogMsgChatID && data.GameLogType != LogMsgIDEcho {
				data.Raw = ""
				break
			}
			switch data.GameLogType {
			// try to strip out world name from message
			case LogMsgIDCharacterWorldName:
				{
					re, err := regexp.Compile("102b:([a-zA-Z'\\-]*) ([A-Z'])([a-z'\\-]*)([A-Z])([a-z]*)")
					if err != nil {
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
					break
				}
			}
			break
		}

	}

	// flags
	if len(fields) >= LogFieldFlags+1 {
		rawFlags := fields[LogFieldFlags]
		if len(rawFlags) > 0 {
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
	}

	return data, nil

}
