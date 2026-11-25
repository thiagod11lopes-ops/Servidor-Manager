import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  buildAppLocationHref,
  pathFromSurface,
  readSurfaceFromLocation,
  usesHashAppRouting,
} from './appSurfaceNavigation.ts'

describe('appSurfaceNavigation', () => {
  it('detecta roteamento por hash em file://', () => {
    assert.equal(
      usesHashAppRouting({ protocol: 'file:', pathname: '/C:/Apps/index.html' }),
      true,
    )
    assert.equal(usesHashAppRouting({ protocol: 'http:', pathname: '/dashboard' }), false)
  })

  it('lê superfície do hash no Electron', () => {
    const location = {
      protocol: 'file:',
      pathname: '/C:/Programs/Servidor OMPS/resources/app.asar/dist/index.html',
      search: '',
      hash: '#/servidor-omps',
    } as Location
    assert.equal(readSurfaceFromLocation(location), 'servidor-omps')
  })

  it('lê superfície do pathname no modo navegador', () => {
    const location = {
      protocol: 'http:',
      pathname: '/servidor-omps',
      search: '',
      hash: '',
    } as Location
    assert.equal(readSurfaceFromLocation(location), 'servidor-omps')
  })

  it('monta href com hash para file://', () => {
    const base = {
      protocol: 'file:',
      pathname: '/C:/index.html',
      search: '',
    }
    assert.equal(
      buildAppLocationHref(base, 'servidor-omps'),
      '/C:/index.html#/servidor-omps',
    )
    assert.equal(pathFromSurface('catalog'), '/')
  })
})
