const test = require('node:test')
const assert = require('node:assert/strict')
const { readFileSync } = require('node:fs')
const { resolve } = require('node:path')

const dockerfile = readFileSync(resolve(__dirname, '..', 'Dockerfile'), 'utf8')

test('Dockerfile 应兼容 GitHub Packages 两种 Schema tarball 地址', () => {
    assert.match(dockerfile, /https:\/\/npm\.pkg\.github\.com\/@wlisfes\/chat-web-base-schema\/-\/chat-web-base-schema-\[\^\\" \]\*/)
    assert.match(dockerfile, /https:\/\/npm\.pkg\.github\.com\/download\/@wlisfes\/chat-web-base-schema\/\[\^\\" \]\*/)
    assert.match(dockerfile, /grep -Fq "\$schema_tarball" yarn\.lock/)
})
