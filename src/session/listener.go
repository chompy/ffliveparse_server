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
	"net"
	"strconv"
)

// Listener - listen for incomming data from ACT
type Listener struct {
	port uint16
}

// Listen - Start listening for data from Act
func Listen(port uint16, manager *Manager) {
	serverAddr, err := net.ResolveUDPAddr("udp", ":"+strconv.Itoa(int(port)))
	if err != nil {
		panic(err)
	}
	serverConn, err := net.ListenUDP("udp", serverAddr)
	if err != nil {
		panic(err)
	}
	defer serverConn.Close()
	buf := make([]byte, 1024)
	for {
		n, addr, err := serverConn.ReadFromUDP(buf)
		if err != nil {
			continue
		}
		manager.Update(buf[0:n], addr)
	}
}
