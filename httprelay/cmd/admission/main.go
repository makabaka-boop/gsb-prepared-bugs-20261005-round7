package main

import (
	"context"
	"flag"
	relay "httprelay"
	"log"
	"net"
)

func main() {
	listen := flag.String("listen", "127.0.0.1:8081", "listen address")
	origin := flag.String("origin", "127.0.0.1:8080", "fixed origin")
	flag.Parse()
	ln, e := net.Listen("tcp", *listen)
	if e != nil {
		log.Fatal(e)
	}
	log.Fatal(relay.NewAdmission(*origin).Serve(context.Background(), ln))
}
