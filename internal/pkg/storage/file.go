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
	"compress/gzip"
	"fmt"
	"io/ioutil"
	"os"
	"path/filepath"

	"../data"
)

// FileHandler - handles file storage
type FileHandler struct {
	path string
}

// NewFileHandler - create new file handler
func NewFileHandler(path string) (FileHandler, error) {
	return FileHandler{
		path: path,
	}, nil
}

// getFilePath - get path to data file
func (f *FileHandler) getFilePath(objType string, encounterUID string) string {
	return filepath.Join(
		f.path,
		encounterUID+"_"+objType+".dat",
	)
}

// getWriteFile - open file for writing
func (f *FileHandler) getWriteFile(objType string, encounterUID string) (*os.File, error) {
	return os.OpenFile(
		f.getFilePath(objType, encounterUID),
		os.O_CREATE|os.O_APPEND|os.O_WRONLY,
		0644,
	)
}

// Init - init file handler
func (f *FileHandler) Init() error {
	return nil
}

// Store - store data objects to file system
func (f *FileHandler) Store(objs []interface{}) error {
	uid := ""
	dType := ""
	var dFile *os.File
	var gzWriter *gzip.Writer
	// itterate data to store
	for index := range objs {
		var byteData []byte
		switch objs[index].(type) {
		case *data.LogLine:
			{
				// log line
				logLine := objs[index].(*data.LogLine)
				if logLine.EncounterUID == "" {
					break
				}
				// must be of same uid/type as last item
				if (uid != "" && logLine.EncounterUID != uid) || (dType != "" && dType != StoreTypeLogLine) {
					return fmt.Errorf("cannot store multiple items of different uid or types")
				}
				byteData = logLine.ToBytes()
				uid = logLine.EncounterUID
				dType = StoreTypeLogLine
				break
			}
		case *data.Combatant:
			{
				// combatant
				combatant := objs[index].(*data.Combatant)
				if combatant.EncounterUID == "" {
					break
				}
				// must be of same uid/type as last item
				if (uid != "" && combatant.EncounterUID != uid) || (dType != "" && dType != StoreTypeCombatant) {
					return fmt.Errorf("cannot store multiple items of different uid or types")
				}
				byteData = combatant.ToBytes()
				uid = combatant.EncounterUID
				dType = StoreTypeCombatant
				break
			}
		}
		// data to write
		if len(byteData) > 0 && uid != "" && dType != "" {
			if dFile == nil {
				dFile, err := f.getWriteFile(dType, uid)
				if err != nil {
					return err
				}
				gzWriter = gzip.NewWriter(dFile)
				defer gzWriter.Close()
				defer dFile.Close()
			}
			gzWriter.Write(byteData)
		}
	}
	return nil
}

// FetchBytes - retrieve data bytes from file system (gzip compressed)
func (f *FileHandler) FetchBytes(params map[string]interface{}) ([]byte, int, error) {
	dType := ParamsGetType(params)
	if dType == "" {
		return nil, 0, nil
	}
	uid := ParamGetUID(params)
	if uid == "" {
		return nil, 0, nil
	}
	res, _ := ioutil.ReadFile(f.getFilePath(dType, uid))
	if len(res) > 0 {
		return res, 1, nil
	}
	return nil, 0, nil
}

// Fetch - retrieve data from file system
func (f *FileHandler) Fetch(params map[string]interface{}) ([]interface{}, int, error) {
	/*byteData, count, err := f.FetchBytes(params)
	if err != nil {
		return nil, 0, err
	}
	if count == 0 {
		return nil, 0, nil
	}
	dType := ParamsGetType(params)
	switch dType {
	case StoreTypeCombatant:
		{
			combatants, _, err := data.DecodeCombatantBytesFile(byteData)
			if err != nil {
				return nil, 0, err
			}
			output := make([]interface{}, len(combatants))
			for index, combatant := range combatants {
				output[index] = combatant
			}
			return output, len(combatants), nil
		}
	}*/
	return nil, 0, nil
}

// CleanUp - perform clean up operations
func (f *FileHandler) CleanUp() error {
	return nil
}
