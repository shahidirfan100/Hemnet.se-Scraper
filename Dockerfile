FROM apify/actor-node:22

COPY --chown=myuser:myuser package*.json ./

# Install production dependencies and verify the platform-selected impit binary.
# impit ships its native binaries as optionalDependencies, so `--omit=optional`
# must NOT be used or the Linux binary will be missing at runtime.
RUN npm --quiet set progress=false \
	&& npm install --omit=dev \
	&& node -e "import('impit').then((m) => console.log('impit OK:', Object.keys(m)))" \
	&& echo "Installed NPM packages:" \
	&& (npm list --omit=dev --all || true) \
	&& echo "Node.js version:" \
	&& node --version \
	&& echo "NPM version:" \
	&& npm --version \
	&& rm -rf ~/.npm

COPY --chown=myuser:myuser . ./

CMD npm start --silent
