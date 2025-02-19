import * as React from 'react';
import type { SVGProps } from 'react';
const SvgUncheckAll = (props: SVGProps<SVGSVGElement>) => (
  <svg
    {...props}
    xmlns="http://www.w3.org/2000/svg"
    viewBox="0 0 26 26"
    style={{
      color: 'inherit',
      ...props.style,
    }}
  >
    <path
      d="M 5 0 C 2.2545455 0 0 2.2545455 0 5 L 0 17 C 0 19.745455 2.2545455 22 5 22 L 17 22 C 19.745455 22 22 19.745455 22 17 L 22 5 C 22 2.2545455 19.745455 0 17 0 L 5 0 z M 5 2 L 17 2 C 18.654545 2 20 3.3454545 20 5 L 20 17 C 20 18.654545 18.654545 20 17 20 L 5 20 C 3.3454545 20 2 18.654545 2 17 L 2 5 C 2 3.3454545 3.3454545 2 5 2 z M 24 5.0253906 L 24 21 C 24 22.654 22.654 24 21 24 L 5.0253906 24 C 5.9383906 25.207 7.373 26 9 26 L 21 26 C 23.757 26 26 23.757 26 21 L 26 9 C 26 7.373 25.207 5.9383906 24 5.0253906 z"
      fill="currentColor"
    />
  </svg>
);
export default SvgUncheckAll;
