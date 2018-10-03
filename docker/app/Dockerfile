FROM golang:alpine
WORKDIR /app
COPY . /app/
RUN cd /app && \
    apk add --update git build-base && \
    go get github.com/olebedev/emitter && \
    go get github.com/martinlindhe/base36 && \
    go get golang.org/x/net/websocket && \
    go get github.com/tdewolff/minify && \
    go get github.com/tdewolff/minify/css && \
    go get github.com/tdewolff/minify/js && \
    go get github.com/go-sql-driver/mysql && \
    go get github.com/segmentio/ksuid && \
    go build -o app.bin && \
    apk del git build-base
CMD ["./app.bin"]
