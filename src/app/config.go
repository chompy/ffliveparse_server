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

package app

import (
	"fmt"
	"os"
	"strings"
)

// VersionNumber - version number
const VersionNumber int32 = 149

// ActPluginMinVersionNumber - act plugin min version
const ActPluginMinVersionNumber int32 = 5

// ActPluginMaxVersionNumber - act plugin max version
const ActPluginMaxVersionNumber int32 = 7

// Name - app name
const Name string = "FFLiveParse"

// DatabasePath - path to database file
const DatabasePath = "./data/db.sqlite"

// FileStorePath - path to file system storage
const FileStorePath = "./data"

// TickRate - how often act data should be sent to web user in ms
const TickRate = 1000

// EncounterResendRate - how often encounter data should be resent in ms
const EncounterResendRate = 5000

// LastUpdateInactiveTime - Time in ms between last data update before data is considered inactive
const LastUpdateInactiveTime = 1800000 // 30 minutes

// MinEncounterSaveLength - Length encounter must be in order to save encounter data
const MinEncounterSaveLength = 20000 // 20 seconds

// MaxEncounterSaveLength - Maximum length an encounter can be
const MaxEncounterSaveLength = 1500000 // 25 minutes

// PastEncounterFetchLimit - Max number of past encounters to fetch in one request
const PastEncounterFetchLimit = 30

// EncounterLogDeleteDays - Number of days that should pass before deleting encounter logs
const EncounterLogDeleteDays = 14

// EncounterDeleteDays - Number of days that should pass before deleting entire encounter
const EncounterDeleteDays = 14

// EncounterCleanUpRate - Rate at which encounter clean up should be ran
const EncounterCleanUpRate = 1800000 // 30 minutes

// CleanUpRoutineRate - Rate at which clean up routines are ran
const CleanUpRoutineRate = 1800000 // 30 minutes

// GetFFToolsURL - url to access fftools api
func GetFFToolsURL() string {
	out, _ := os.LookupEnv("FFTOOLS_URL")
	return strings.TrimRight(out, "/") + "/"
}

// GetFFTriggersURL - url for links to fftriggers
func GetFFTriggersURL() string {
	out, _ := os.LookupEnv("FFTRIGGERS_URL")
	if out == "" {
		out = "https://triggers.fftools.net"
	}
	return strings.TrimRight(out, "/") + "/"
}

// GetVersionString - get version as string in format X.XX
func GetVersionString() string {
	return fmt.Sprintf("%.2f", float32(VersionNumber)/100.0)
}

// GetActVersionString - get act version as string in format X.XX
func GetActVersionString() string {
	return fmt.Sprintf("%.2f", float32(ActPluginMaxVersionNumber)/100.0)
}
