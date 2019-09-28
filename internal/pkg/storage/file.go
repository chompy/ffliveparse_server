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

import (
	"bufio"
	"compress/gzip"
	"fmt"
	"os"
	"path/filepath"
	"time"

	"../app"
	"../data"
	times "gopkg.in/djherbis/times.v1"
)

// FileHandler - handles file storage
type FileHandler struct {
	log app.Logging
}

// NewFileHandler - create new file handler
func NewFileHandler() (FileHandler, error) {
	return FileHandler{
		log: app.Logging{ModuleName: "STORAGE/FILE"},
	}, nil
}

// getFilePath - get path to data file
func (f *FileHandler) getFilePath(encounterUID string, storeType string) string {
	return filepath.Join(
		app.FileStorePath,
		encounterUID+"_"+storeType+".dat",
	)
}

// Store - write objects to file
func (f *FileHandler) Store(objs []interface{}) error {
	var file *os.File
	var gf *gzip.Writer
	var fw *bufio.Writer
	var objBytes []byte
	var err error
	objType := ""
	encounterUID := ""
	// itterate store objects and write to file
	for _, obj := range objs {
		objBytes = make([]byte, 0)
		switch obj.(type) {
		case *data.Encounter:
			{
				if objType == "" {
					objType = StoreTypeEncounter
				}
				if objType != StoreTypeEncounter {
					break
				}
				objBytes = obj.(*data.Encounter).ToBytes()
				encounterUID = obj.(*data.Encounter).UID
				break
			}
		case *data.Combatant:
			{
				if objType == "" {
					objType = StoreTypeCombatant
				}
				if objType != StoreTypeCombatant {
					break
				}
				objBytes = obj.(*data.Combatant).ToBytes()
				encounterUID = obj.(*data.Combatant).EncounterUID
				break
			}
		case *data.LogLine:
			{
				if objType == "" {
					objType = StoreTypeLogLine
				}
				if objType != StoreTypeLogLine {
					break
				}
				objBytes = obj.(*data.LogLine).ToBytes()
				encounterUID = obj.(*data.LogLine).EncounterUID
				break
			}
		}
		if len(objBytes) == 0 || encounterUID == "" {
			continue
		}
		// open file
		if file == nil {
			file, err = os.OpenFile(
				f.getFilePath(encounterUID, objType),
				os.O_WRONLY|os.O_CREATE,
				0644,
			)
			if err != nil {
				return err
			}
			gf = gzip.NewWriter(file)
			fw = bufio.NewWriter(gf)
			defer fw.Flush()
			defer gf.Flush()
			defer file.Close()
		}
		// write to file
		_, err = fw.Write(objBytes)
		if err != nil {
			return err
		}
	}
	return nil
}

// CleanUp - perform clean up operations
func (f *FileHandler) CleanUp() error {
	cleanCount := 0
	noBirthTimeCount := 0
	cleanUpDate := time.Now().Add(time.Duration(-app.EncounterLogDeleteDays*24) * time.Hour)
	f.log.Start(fmt.Sprintf("Start file clean up. (Clean up files older than %s.)", cleanUpDate))
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
		f.log.Finish(fmt.Sprintf("Finish file clean up. (%d files removed.)", cleanCount))
		if noBirthTimeCount > 0 {
			f.log.Log(fmt.Sprintf("%d files had no creation time.", noBirthTimeCount))
		}
	}
	return err
}
