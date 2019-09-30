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
	"bufio"
	"compress/gzip"
	"fmt"
	"io"
	"io/ioutil"
	"os"
	"path"
	"path/filepath"
	"sync"
	"time"

	"../app"
	"../data"
	times "gopkg.in/djherbis/times.v1"
)

// LogLineByteSize - size of log line bytes
const LogLineByteSize = 512

// LogLineReadLimit - limit of log lines per read
const LogLineReadLimit = 16

// LogLineManager - handles log line data for session
type LogLineManager struct {
	logLines     []*data.LogLine
	lastTime     time.Time
	dumpFile     *os.File
	dumpFileLock *sync.Mutex
	savePath     string
	log          app.Logging
	encounterUID string
}

// NewLogLineManager - create new log line manager
func NewLogLineManager() LogLineManager {
	l := LogLineManager{
		log:          app.Logging{ModuleName: "LOGLINE"},
		dumpFileLock: &sync.Mutex{},
		savePath:     app.FileStorePath,
	}
	l.Reset()
	return l
}

// Reset - reset log line manager
func (l *LogLineManager) Reset() {
	l.logLines = make([]*data.LogLine, 0)
	l.lastTime = time.Now()
	l.encounterUID = ""
	if l.dumpFile != nil {
		l.dumpFileLock.Lock()
		defer l.dumpFileLock.Unlock()
		l.dumpFile.Close()
		os.Remove(l.dumpFile.Name())
		l.dumpFile = nil
	}
}

// SetEncounterUID - set encounter uid for logging
func (l *LogLineManager) SetEncounterUID(encounterUID string) {
	l.log.ModuleName = fmt.Sprintf("LOGLINE/%s", encounterUID)
	l.encounterUID = encounterUID
}

// SetSavePath - set path to save permanent log file to
func (l *LogLineManager) SetSavePath(path string) {
	l.savePath = path
}

// Update - add new log line
func (l *LogLineManager) Update(logLine data.LogLine) {
	// ignore log lines in the past
	if logLine.Time.Before(l.lastTime) {
		return
	}
	// if log line parser sets 'Raw' to empty then it should be ignored
	// (does this for chat messages)
	pLogLine, _ := ParseLogLine(logLine)
	if pLogLine.Raw == "" {
		return
	}
	l.logLines = append(l.logLines, &logLine)
}

// Dump - dump log lines to temp file
func (l *LogLineManager) Dump() ([]data.LogLine, error) {
	l.dumpFileLock.Lock()
	defer l.dumpFileLock.Unlock()
	// open dump file
	var err error
	if l.dumpFile == nil {
		l.dumpFile, err = ioutil.TempFile(os.TempDir(), "fflp-*.dat")
		if err != nil {
			return nil, err
		}
	}
	// write to dump file
	output := make([]data.LogLine, 0)
	for index := range l.logLines {
		output = append(output, *l.logLines[index])
		// get log line bytes and fill to max size
		logLineBytes := l.logLines[index].ToBytes()
		if len(logLineBytes) > LogLineByteSize {
			continue
		}
		for len(logLineBytes) < LogLineByteSize {
			logLineBytes = append(logLineBytes, 0)
		}
		// write to file
		_, err := l.dumpFile.Write(logLineBytes)
		if err != nil {
			return nil, err
		}
	}
	l.logLines = make([]*data.LogLine, 0)
	return output, nil
}

// GetLogLinesFromReader - retrieve log lines from a reader
func GetLogLinesFromReader(r io.Reader) ([]data.LogLine, error) {
	output := make([]data.LogLine, 0)
	for {
		logLineBytes := make([]byte, LogLineByteSize)
		n, err := io.ReadFull(r, logLineBytes)
		if err == io.EOF || n == 0 {
			break
		} else if err != nil {
			return output, err
		} else if n < LogLineByteSize {
			return output, fmt.Errorf("log read was less then %d bytes", LogLineByteSize)
		} else if n == LogLineByteSize {
			logLine := data.LogLine{}
			logLine.FromBytes(logLineBytes)
			output = append(output, logLine)
			// reached read limit
			if len(output) >= LogLineReadLimit {
				break
			}
		}
	}
	return output, nil
}

// GetLogLines - retrieve log lines from dump
func (l *LogLineManager) GetLogLines(offset int) ([]data.LogLine, error) {
	l.dumpFileLock.Lock()
	defer l.dumpFileLock.Unlock()
	defer l.dumpFile.Seek(0, 2)
	_, err := l.dumpFile.Seek(int64(offset*LogLineByteSize), 0)
	if err != nil {
		return nil, err
	}
	return GetLogLinesFromReader(l.dumpFile)
}

// GetLogFilePath - get path to permanent log file
func GetLogFilePath(savePath string, encounterUID string) string {
	return path.Join(savePath, fmt.Sprintf("fflp_%s_LogLine.dat", encounterUID))
}

// GetLogFilePath - get path to permanent log file
func (l *LogLineManager) GetLogFilePath() string {
	return GetLogFilePath(l.savePath, l.encounterUID)
}

// Save - save log lines to permanent storage
func (l *LogLineManager) Save() error {
	if l.encounterUID == "" {
		return fmt.Errorf("can't save log lines without encounter uid set")
	}
	l.dumpFileLock.Lock()
	defer l.dumpFileLock.Unlock()
	defer l.dumpFile.Seek(0, 2)
	// open output file
	f, err := os.OpenFile(l.GetLogFilePath(), os.O_CREATE|os.O_WRONLY, 0664)
	if err != nil {
		return err
	}
	// prepare gzip write
	gf := gzip.NewWriter(f)
	fw := bufio.NewWriter(gf)
	defer f.Close()
	// read dump file
	l.dumpFile.Seek(0, 0)
	buf := make([]byte, LogLineByteSize)
	for {
		n, err := io.ReadFull(l.dumpFile, buf)
		if err == io.EOF || n == 0 {
			break
		} else if err != nil {
			return err
		} else if n == LogLineByteSize {
			_, err := fw.Write(buf)
			if err != nil {
				return err
			}
		}
	}
	fw.Flush()
	gf.Flush()
	gf.Close()
	return nil
}

// LogLineCleanUp - perform log line clean up operations
func LogLineCleanUp() error {
	logger := app.Logging{ModuleName: "LOGLINE-CLEANUP"}
	cleanCount := 0
	noBirthTimeCount := 0
	cleanUpDate := time.Now().Add(time.Duration(-app.EncounterLogDeleteDays*24) * time.Hour)
	logger.Start(fmt.Sprintf("Start log file clean up. (Clean up log older than %s.)", cleanUpDate))
	err := filepath.Walk(app.FileStorePath, func(path string, info os.FileInfo, err error) error {
		if info.IsDir() || filepath.Ext(path) != ".dat" {
			return nil
		}
		t, err := times.Stat(path)
		if err == nil && !t.HasBirthTime() {
			noBirthTimeCount++
		}
		if (err == nil && t.HasBirthTime() && t.BirthTime().Before(cleanUpDate)) || info.ModTime().Before(cleanUpDate) {
			cleanCount++
			return os.Remove(path)
		}
		return nil
	})
	if err == nil {
		logger.Finish(fmt.Sprintf("Finish file clean up. (%d files removed.)", cleanCount))
		if noBirthTimeCount > 0 {
			logger.Log(fmt.Sprintf("%d files had no creation time.", noBirthTimeCount))
		}
	}
	return err
}
