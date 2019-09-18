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
	"log"
	"runtime"
	"time"
)

// LogLevelInfo - denote info log message
const LogLevelInfo = "INFO"

// LogLevelError - denote error log message
const LogLevelError = "ERROR"

// Logging - app logger util
type Logging struct {
	ModuleName string
	start      time.Time
}

// LogLevel - add message to log with level
func (l *Logging) LogLevel(msg string, level string) {
	if level == LogLevelInfo {
		log.Printf("[%s] %s", l.ModuleName, msg)
		return
	}
	log.Printf("[%s][%s] %s", level, l.ModuleName, msg)
}

// Log - add info message to log
func (l *Logging) Log(msg string) {
	l.LogLevel(msg, LogLevelInfo)
}

// Error - add error message to log
func (l *Logging) Error(err error) {
	if err == nil {
		return
	}
	_, fn, line, _ := runtime.Caller(1)
	msg := fmt.Sprintf("%s (%s at line %d)", err.Error(), fn, line)
	l.LogLevel(msg, LogLevelError)
}

// Panic - add error message to log and panic
func (l *Logging) Panic(err error) {
	if err == nil {
		return
	}
	_, fn, line, _ := runtime.Caller(1)
	msg := fmt.Sprintf("%s (%s at line %d)", err.Error(), fn, line)
	l.LogLevel(msg, LogLevelError)
	panic(err)
}

// Start - start a task to later log a 'finished in x time' message
func (l *Logging) Start(msg string) {
	l.start = time.Now()
	l.Log(msg)
}

// Finish - finish a task started with 'start' and display time taken with log message
func (l *Logging) Finish(msg string) {
	msg = fmt.Sprintf("%s (%s)", msg, time.Now().Sub(l.start))
	l.Log(msg)
}
