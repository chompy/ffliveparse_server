FROM staticfloat/nginx-certbot
COPY app.conf /etc/nginx/conf.d/
COPY udp.conf /etc/nginx/udp.conf
RUN echo "include udp.conf;" >> /etc/nginx/nginx.conf