/**
 * @format
 */

import React from 'react';
import ReactTestRenderer from 'react-test-renderer';
import App from '../App';

test('renders correctly', async () => {
  let renderer!: ReactTestRenderer.ReactTestRenderer;

  await ReactTestRenderer.act(() => {
    renderer = ReactTestRenderer.create(<App />);
  });

  // jest.setup.js mocks the safe area provider so it renders its children
  // right away; without the mock it would render nothing and still pass.
  expect(JSON.stringify(renderer.toJSON())).toContain('Cotizador de Prestamos');
});
