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

import "fmt"

// VersionNumber - version number
const VersionNumber int32 = 103

// ActPluginVersionNumber - act plugin version, must match number recieved from Act plugin to parse data
const ActPluginVersionNumber int32 = 5

// Name - app name
const Name string = "FFLiveParse"

// DataPath - path where user data is stored
const DataPath = "./data"

// TickRate - how often combatant and encounter data should be sent to web user in ms
const TickRate = 3000

// LogTickRate - how often log line data should be sent to web user in ms
const LogTickRate = 1000

// GetVersionString - get version as string in format X.XX
func GetVersionString() string {
	return fmt.Sprintf("%.2f", float32(VersionNumber)/100.0)
}

// GetActVersionString - get act version as string in format X.XX
func GetActVersionString() string {
	return fmt.Sprintf("%.2f", float32(ActPluginVersionNumber)/100.0)
}
