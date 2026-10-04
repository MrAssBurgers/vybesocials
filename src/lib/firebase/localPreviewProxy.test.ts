import { describe, expect, it } from 'vitest';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { localPreviewFunctionsProxy, localPreviewStorageProxy } from '../../../scripts/qa/local-preview-proxy';

describe('fixed local QA Functions proxy', () => {
  it('is absent outside explicit local QA', () => { expect(localPreviewFunctionsProxy(false)).toBeUndefined(); });
  it('pins the only target without rewriting paths or following redirects', () => {
    const entries = Object.entries(localPreviewFunctionsProxy(true)!);
    expect(entries).toHaveLength(1);
    expect(entries[0][1]).toMatchObject({ target: 'http://127.0.0.1:5101', changeOrigin: true, followRedirects: false, ws: false });
    expect(entries[0][1].rewrite).toBeUndefined();
  });
  it.each(['getGameCapture', 'tokenMarketplace', 'checkPremium'])('matches a demo callable %s', name => {
    const pattern = new RegExp(Object.keys(localPreviewFunctionsProxy(true)!)[0]);
    expect(pattern.test(`/demo-vybe-preview/us-central1/${name}`)).toBe(true);
  });
  it.each([
    '/real-project/us-central1/getGameCapture', '/demo-vybe-preview/europe-west1/getGameCapture',
    '/demo-vybe-preview/us-central1/getGameCapture/extra', '/demo-vybe-preview/us-central1/getGameCapture?target=https://example.test',
    '/demo-vybe-preview/us-central1/../getGameCapture', '/demo-vybe-preview/us-central1/%2fgetGameCapture',
    '/demo-vybe-preview/us-central1/', 'http://example.test/demo-vybe-preview/us-central1/getGameCapture',
  ])('does not proxy another route: %s', pathname => {
    expect(new RegExp(Object.keys(localPreviewFunctionsProxy(true)!)[0]).test(pathname)).toBe(false);
  });
  it.each(['GET', 'HEAD', 'PUT', 'DELETE', 'PATCH', 'CONNECT', undefined])('does not forward method %s', method => {
    const options = Object.values(localPreviewFunctionsProxy(true)!)[0];
    expect(options.bypass!({ method } as IncomingMessage, {} as ServerResponse, options)).toBe(false);
  });
  it.each(['POST', 'OPTIONS'])('forwards the normal callable method %s', method => {
    const options = Object.values(localPreviewFunctionsProxy(true)!)[0];
    expect(options.bypass!({ method } as IncomingMessage, {} as ServerResponse, options)).toBeUndefined();
  });
});

describe('fixed local QA Storage proxy', () => {
  it('is absent outside QA and pins one bucket without redirects or path rewriting', () => {
    expect(localPreviewStorageProxy(false)).toBeUndefined();
    const entries = Object.entries(localPreviewStorageProxy(true)!); expect(entries).toHaveLength(1);
    expect(entries[0][1]).toMatchObject({ target: 'http://127.0.0.1:9399', changeOrigin: false, followRedirects: false, ws: false });
    expect(entries[0][1].rewrite).toBeUndefined();
  });
  it.each([
    '/v0/b/demo-vybe-preview.appspot.com/o',
    '/v0/b/demo-vybe-preview.appspot.com/o/game-captures%2Fplayer%2Fcapture?alt=media',
    '/v0/b/demo-vybe-preview.appspot.com/o?name=avatars%2Fplayer%2Ftest.png',
    '/v0/b/demo-vybe-preview.appspot.com/o?name=test.png&upload_id=example&upload_protocol=resumable',
  ])('accepts the real object and resumable protocol shape: %s', pathname => {
    expect(new RegExp(Object.keys(localPreviewStorageProxy(true)!)[0]).test(pathname)).toBe(true);
  });
  it.each([
    '/v0/b/real-project.appspot.com/o/test', '/v0/b/demo-vybe-preview.appspot.com.evil/o/test',
    '/v0/b/demo-vybe-previewXappspotXcom/o/test', '/v0/b/demo-vybe-preview.appspot.com/oops',
    '/v0/b/demo-vybe-preview.appspot.com/o/../../admin', '/storage/v1/b/demo-vybe-preview.appspot.com/o',
    '/v0/b/demo-vybe-preview.appspot.com/o/a/b', 'http://example.test/v0/b/demo-vybe-preview.appspot.com/o/test',
  ])('does not forward another bucket or route: %s', pathname => {
    expect(new RegExp(Object.keys(localPreviewStorageProxy(true)!)[0]).test(pathname)).toBe(false);
  });
  it.each(['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'])('forwards Firebase object protocol method %s', method => {
    const options = Object.values(localPreviewStorageProxy(true)!)[0];
    expect(options.bypass!({ method } as IncomingMessage, {} as ServerResponse, options)).toBeUndefined();
  });
  it.each(['HEAD', 'CONNECT', 'TRACE', undefined])('does not forward other method %s', method => {
    const options = Object.values(localPreviewStorageProxy(true)!)[0];
    expect(options.bypass!({ method } as IncomingMessage, {} as ServerResponse, options)).toBe(false);
  });
});
