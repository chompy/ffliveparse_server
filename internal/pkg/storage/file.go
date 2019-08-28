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
	"os"
	"path/filepath"

	"../act"
)

const fileTypeLogLine = "LogLine"
const fileTypeCombatant = "Combatant"

// FileHandler - handles file storage
type FileHandler struct {
	BaseHandler
	path string
}

// NewFileHandler - create new file handler
func NewFileHandler(path string) (FileHandler, error) {
	return FileHandler{
		path: path,
	}, nil
}

// getFileWriter - get file writer object
func (f *FileHandler) getFileWriter(objType string, encounterUID string) (*os.File, error) {
	fullPath := filepath.Join(
		f.path,
		encounterUID+"_"+objType+".dat",
	)
	return os.OpenFile(fullPath, os.O_CREATE|os.O_APPEND|os.O_WRONLY, 0644)
}

// Store - store data to file system
func (f *FileHandler) Store(data []interface{}) error {
	fileWriters := make(map[string]*os.File)
	for index := range data {
		switch data[index].(type) {
		case *act.LogLine:
			{
				// log line
				logLine := data[index].(*act.LogLine)
				if logLine.EncounterUID == "" {
					break
				}
				// open file if needed
				if fileWriters[fileTypeLogLine+logLine.EncounterUID] == nil {
					fileWriter, err := f.getFileWriter(fileTypeLogLine, logLine.EncounterUID)
					if err != nil {
						return err
					}
					defer fileWriter.Close()
				}
				// write
				_, err := fileWriters[fileTypeLogLine+logLine.EncounterUID].Write(
					act.EncodeLogLineBytes(logLine),
				)
				if err != nil {
					return err
				}
				break
			}
		case *act.Combatant:
			{
				// combatant
				combatant := data[index].(*act.Combatant)
				if combatant.EncounterUID == "" {
					break
				}
				// open file if needed
				if fileWriters[fileTypeCombatant+combatant.EncounterUID] == nil {
					fileWriter, err := f.getFileWriter(fileTypeCombatant, combatant.EncounterUID)
					if err != nil {
						return err
					}
					defer fileWriter.Close()
				}
				// write
				combatantData := []act.Combatant{
					*combatant,
				}
				_, err := fileWriters[fileTypeCombatant+combatant.EncounterUID].Write(
					act.EncodeCombatantBytes(&combatantData),
				)
				if err != nil {
					return err
				}
				break
			}
		}
	}
	return nil
}

// Fetch -
func (f *FileHandler) Fetch(params map[string]interface{}) ([]interface{}, error) {

	return nil, nil
}
