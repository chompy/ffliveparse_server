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

// Combatant - Data about a combatant
type Combatant struct {
	EncounterUID   string
	ActEncounterID uint32
	ID             int32
	Name           string
	Job            string
	Damage         int32
	DamageTaken    int32
	DamageHealed   int32
	Deaths         int32
	Hits           int32
	Heals          int32
	Kills          int32
}

// Encounter - Data about an encounter
type Encounter struct {
	UID          string
	ActID        uint32
	StartTime    time.Time
	EndTime      time.Time
	Zone         string
	Damage       int32
	Active       bool
	SuccessLevel uint8
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
