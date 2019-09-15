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

package storage

import "time"

// ParamGetString - fetch string from param list
func ParamGetString(params map[string]interface{}, key string) string {
	val := params[key]
	if val == nil {
		return ""
	}
	return val.(string)
}

// ParamGetInt - fetch int from param list
func ParamGetInt(params map[string]interface{}, key string) int {
	val := params[key]
	if val == nil {
		return 0
	}
	return val.(int)
}

// ParamGetTime - fetch time from param list
func ParamGetTime(params map[string]interface{}, key string) time.Time {
	val := params[key]
	if val == nil {
		return time.Time{}
	}
	return val.(time.Time)
}

// ParamGetID - fetch id from param list
func ParamGetID(params map[string]interface{}) int {
	return ParamGetInt(params, "id")
}

// ParamGetUID - fetch uid from param list
func ParamGetUID(params map[string]interface{}) string {
	val := ParamGetString(params, "uid")
	if val == "" {
		val = ParamGetString(params, "encounter_uid")
	}
	return val
}

// ParamGetDate - fetch date from param list
func ParamGetDate(params map[string]interface{}) time.Time {
	return ParamGetTime(params, "date")
}

// ParamsGetType - fetch type from param list
func ParamsGetType(params map[string]interface{}) string {
	return ParamGetString(params, "type")
}
