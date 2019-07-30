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
	"net"
	"time"
)

// DataTypeSession - Data type, session data
const DataTypeSession byte = 1

// DataTypeEncounter - Data type, encounter data
const DataTypeEncounter byte = 2

// DataTypeCombatant - Data type, combatant data
const DataTypeCombatant byte = 3

// DataTypeLogLine - Data type, log line
const DataTypeLogLine byte = 5

// DataTypeFlag - Data type, boolean flag
const DataTypeFlag byte = 99

// Player - Data about a player
type Player struct {
	ID      int32  `json:"id"`
	Name    string `json:"name"`
	ActName string `json:"act_name"`
	World   string `json:"world"`
}

// Combatant - Data about a combatant
type Combatant struct {
	Player         Player    `json:"player"`
	EncounterUID   string    `json:"encounter_uid"`
	ActEncounterID uint32    `json:"act_encounter_id"`
	Time           time.Time `json:"time"`
	Job            string    `json:"job"`
	Damage         int32     `json:"damage"`
	DamageTaken    int32     `json:"damage_taken"`
	DamageHealed   int32     `json:"damage_healed"`
	Deaths         int32     `json:"deaths"`
	Hits           int32     `json:"hits"`
	Heals          int32     `json:"heals"`
	Kills          int32     `json:"kills"`
}

// Encounter - Data about an encounter
type Encounter struct {
	UID          string    `json:"uid"`
	ActID        uint32    `json:"act_id"`
	CompareHash  string    `json:"compare_hash"`
	StartTime    time.Time `json:"start_time"`
	EndTime      time.Time `json:"end_time"`
	Zone         string    `json:"zone"`
	Damage       int32     `json:"damage"`
	Active       bool      `json:"active"`
	SuccessLevel uint8     `json:"success_level"`
	HasLogs      bool      `json:"has_logs"`
}

// LogLine - Log line from Act
type LogLine struct {
	EncounterUID   string
	ActEncounterID uint32
	Time           time.Time
	LogLine        string
}

// Session - Data about a specific session
type Session struct {
	UploadKey string
	IP        net.IP
	Port      int
	Created   time.Time
}

// Flag - Boolean flag with name
type Flag struct {
	Name  string
	Value bool
}
