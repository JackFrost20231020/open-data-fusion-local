# Build the MinIO client from the signed upstream release. Docker Hub
# minio/mc is no longer anonymously pullable, so the production-like
# bootstrap must not reference that repository.
#
# Both external base image references are immutable multi-architecture OCI
# indexes. The source revision is the signed RELEASE.2025-08-13T08-35-41Z
# commit.
FROM golang:1.24.8-bookworm@sha256:4ed690d6649d63c312b99a6120025ec79ce3b542968a37da53d6236c7c61a848 AS build

ARG MC_RELEASE=RELEASE.2025-08-13T08-35-41Z
ARG MC_COMMIT=7394ce0dd2a80935aded936b09fa12cbb3cb8096

RUN apt-get update \
  && apt-get install --yes --no-install-recommends ca-certificates git \
  && rm -rf /var/lib/apt/lists/*

RUN git clone --depth 1 --branch "${MC_RELEASE}" https://github.com/minio/mc.git /src \
  && cd /src \
  && git checkout --detach "${MC_COMMIT}" \
  && test "$(git rev-parse HEAD)" = "${MC_COMMIT}"

WORKDIR /src

RUN CGO_ENABLED=0 GOOS=linux GOARCH="$(go env GOARCH)" \
  go build -trimpath -o /out/mc .

FROM debian:bookworm-slim@sha256:60eac759739651111db372c07be67863818726f754804b8707c90979bda511df

RUN apt-get update \
  && apt-get install --yes --no-install-recommends ca-certificates \
  && rm -rf /var/lib/apt/lists/* \
  && groupadd --system --gid 10002 mc \
  && useradd --system --uid 10002 --gid mc --home-dir /home/mc --create-home --shell /usr/sbin/nologin mc

COPY --from=build /out/mc /usr/local/bin/mc

USER mc
ENTRYPOINT ["/bin/sh"]
