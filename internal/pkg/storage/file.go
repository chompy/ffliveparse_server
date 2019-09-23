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
	"io"
	"os"
	"path/filepath"
	"sync"
	"time"

	"../app"
	"../data"
	times "gopkg.in/djherbis/times.v1"
)

// FileHandler - handles file storage
type FileHandler struct {
	lock *sync.Mutex
	path string
	log  app.Logging
	file *os.File
	gf   *gzip.Writer
	fw   *bufio.Writer
	mode int
}

// NewFileHandler - create new file handler
func NewFileHandler(path string) (FileHandler, error) {
	return FileHandler{
		path: path,
		log:  app.Logging{ModuleName: "STORAGE/FILE"},
		file: nil,
		gf:   nil,
		fw:   nil,
		lock: &sync.Mutex{},
	}, nil
}

// getFilePath - get path to data file
func (f *FileHandler) getFilePath(encounterUID string) string {
	return filepath.Join(
		f.path,
		encounterUID+".dat",
	)
}

// OpenWrite - open file for writting
func (f *FileHandler) OpenWrite(encounterUID string) error {
	f.lock.Lock()
	var err error
	f.file, err = os.OpenFile(
		f.getFilePath(encounterUID),
		os.O_CREATE|os.O_WRONLY,
		0644,
	)
	if err != nil {
		return err
	}
	f.log.Log(fmt.Sprintf("Write to encounter '%s.'", encounterUID))
	f.gf = gzip.NewWriter(f.file)
	f.fw = bufio.NewWriter(f.gf)
	f.mode = os.O_WRONLY
	return nil
}

// OpenRead - open file for read, get gzip reader
func (f *FileHandler) OpenRead(encounterUID string) (*gzip.Reader, error) {
	f.lock.Lock()
	var err error
	f.file, err = os.OpenFile(
		f.getFilePath(encounterUID),
		os.O_RDONLY,
		0644,
	)
	if err != nil {
		return nil, err
	}
	f.log.Log(fmt.Sprintf("Read encounter '%s.'", encounterUID))
	f.mode = os.O_RDONLY
	return gzip.NewReader(f.file)
}

// Close - close file
func (f *FileHandler) Close() error {
	if f.file == nil {
		return fmt.Errorf("no file was open")
	}
	defer f.lock.Unlock()
	defer f.file.Close()
	if f.mode == os.O_WRONLY {
		err := f.fw.Flush()
		if err != nil {
			return err
		}
		err = f.gf.Close()
		if err != nil {
			return err
		}
	}
	return nil
}

// Write - write to file
func (f *FileHandler) Write(store interface{}) error {
	if f.file == nil || f.mode == os.O_RDONLY {
		return fmt.Errorf("file not open or in read mode")
	}
	switch store.(type) {
	case []byte:
		{
			data := store.([]byte)
			_, err := f.fw.Write(data)
			return err
		}
	case *os.File:
		{
			file := store.(*os.File)
			buf := make([]byte, 4096)
			for {
				n, err := file.Read(buf)
				if n > 0 {
					_, err = f.fw.Write(buf)
					if err != nil {
						return err
					}
				}
				if err == io.EOF {
					break
				}
				if err != nil {
					return err
				}
			}
			break
		}
	case data.ByteEncodable:
		{
			byteEncodable := store.(data.ByteEncodable)
			data := byteEncodable.ToBytes()
			_, err := f.fw.Write(data)
			return err
		}
	}
	return nil
}

// Remove - remove data from file system
func (f *FileHandler) Remove(encounterUID string) error {
	f.lock.Lock()
	defer f.lock.Unlock()
	err := os.Remove(f.getFilePath(encounterUID))
	if err != nil {
		if err == os.ErrNotExist {
			return nil
		}
		return err
	}
	return nil
}

// CleanUp - perform clean up operations
func (f *FileHandler) CleanUp() error {
	f.lock.Lock()
	defer f.lock.Unlock()
	cleanCount := 0
	noBirthTimeCount := 0
	cleanUpDate := time.Now().Add(time.Duration(-app.EncounterLogDeleteDays*24) * time.Hour)
	f.log.Start(fmt.Sprintf("Start file clean up. (Clean up files older than %s.)", cleanUpDate))
	err := filepath.Walk(f.path, func(path string, info os.FileInfo, err error) error {
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
