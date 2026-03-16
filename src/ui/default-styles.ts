/**
 * Default styles and icons for camera overlay UI
 */
import { 
  ButtonStyle, 
  ButtonsConfig 
} from '../types/ui-types';

/**
 * Default SVG icons for camera controls
 */
export const defaultIcons = {
  captureIcon: `<svg xmlns="http://www.w3.org/2000/svg" height="24" viewBox="0 0 24 24" width="24"><circle cx="12" cy="12" r="10" fill="currentColor"/></svg>`,
  doneIcon: `<svg xmlns="http://www.w3.org/2000/svg" height="24" viewBox="0 0 24 24" width="24"><path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41L9 16.17z" fill="currentColor"/></svg>`,
  cancelIcon: `<svg xmlns="http://www.w3.org/2000/svg" height="24" viewBox="0 0 24 24" width="24"><path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12 19 6.41z" fill="currentColor"/></svg>`,
  switchCameraIcon: `<svg xmlns="http://www.w3.org/2000/svg" height="24" viewBox="0 0 24 24" width="24"><path d="M20 4h-3.17L15 2H9L7.17 4H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm-5 11.5V13H9v2.5L5.5 12 9 8.5V11h6V8.5l3.5 3.5-3.5 3.5z" fill="currentColor"/></svg>`,
  zoomIcon: `<svg xmlns="http://www.w3.org/2000/svg" height="24" viewBox="0 0 24 24" width="24"><path d="M15.5 14h-.79l-.28-.27C15.41 12.59 16 11.11 16 9.5 16 5.91 13.09 3 9.5 3S3 5.91 3 9.5 5.91 16 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z" fill="currentColor"/><path d="M12 10h-2v2H9v-2H7V9h2V7h1v2h2v1z" fill="currentColor"/></svg>`,
  flashOffIcon: `<svg xmlns="http://www.w3.org/2000/svg" height="24" viewBox="0 0 24 24" width="24"><path d="M17 10h-4l3-8H7v11h3v9l7-12zm-7-8V4h2.17l-2.17 6H8.83L10 2z" fill="currentColor"/><path d="M2.81 2.81L1.39 4.22l6.39 6.39H7v11h3v9l1.68-2.9 9.12 9.12 1.41-1.41L2.81 2.81z" fill="currentColor"/></svg>`,
  flashOnIcon: `<svg xmlns="http://www.w3.org/2000/svg" height="24" viewBox="0 0 24 24" width="24"><path d="M7 2v11h3v9l7-12h-4l3-8z" fill="currentColor"/></svg>`,
  flashAutoIcon: `<svg xmlns="http://www.w3.org/2000/svg" height="24" viewBox="0 0 24 24" width="24"><path d="M7 2v11h3v9l7-12h-4l3-8z" fill="currentColor"/><text x="12" y="20" text-anchor="middle" font-size="8" font-weight="bold" fill="currentColor">A</text></svg>`,
    torchOffIcon: `<svg width="194px" height="194px" viewBox="0 0 194 194" version="1.1" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink">
    <title>Group 2</title>
    <g id="Page-1" stroke="none" stroke-width="1" fill="none" fill-rule="evenodd">
        <g id="Group-2" transform="translate(0.000000, 0.805826)" fill="currentColor">
            <path d="M87.7530483,65.2720779 L127.351028,104.870058 L48.1550686,184.066017 L8.55708883,144.468037 L87.7530483,65.2720779 Z M92.9246212,94.2842712 C89.8004269,91.1600769 84.735107,91.1600769 81.6109127,94.2842712 L81.6109127,94.2842712 L63.9332432,111.961941 C60.8090488,115.086135 60.8090488,120.151455 63.9332432,123.275649 L63.9332432,123.275649 L68.8829906,128.225397 C72.007185,131.349591 77.0725048,131.349591 80.1966991,128.225397 L80.1966991,128.225397 L97.8743687,110.547727 C100.998563,107.423533 100.998563,102.358213 97.8743687,99.2340187 L97.8743687,99.2340187 Z" id="Combined-Shape"></path>
            <rect id="Rectangle" transform="translate(149.500000, 44.194174) rotate(-45.000000) translate(-149.500000, -44.194174) " x="135" y="-3.80582618" width="29" height="96"></rect>
            <polygon id="Polygon" transform="translate(122.916857, 69.909099) rotate(45.000000) translate(-122.916857, -69.909099) " points="122.916857 52.6185734 168.416857 52.409099 151.037404 87.409099 94.7963109 87.409099 77.4168574 52.409099"></polygon>
            <circle id="Oval" cx="27.75" cy="164.944174" r="27.75"></circle>
        </g>
    </g>
</svg>`,
  torchOnIcon: `<svg width="223px" height="223px" viewBox="0 0 223 223" version="1.1" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink">
    <title>Group 3</title>
    <g id="Page-1" stroke="none" stroke-width="1" fill="none" fill-rule="evenodd">
        <g id="Group-3" transform="translate(0.000000, 0.614339)" fill="currentColor">
            <g id="Group-2" transform="translate(0.000000, 29.191487)">
                <path d="M87.7530483,65.2720779 L127.351028,104.870058 L48.1550686,184.066017 L8.55708883,144.468037 L87.7530483,65.2720779 Z M92.9246212,94.2842712 C89.8004269,91.1600769 84.735107,91.1600769 81.6109127,94.2842712 L81.6109127,94.2842712 L63.9332432,111.961941 C60.8090488,115.086135 60.8090488,120.151455 63.9332432,123.275649 L63.9332432,123.275649 L68.8829906,128.225397 C72.007185,131.349591 77.0725048,131.349591 80.1966991,128.225397 L80.1966991,128.225397 L97.8743687,110.547727 C100.998563,107.423533 100.998563,102.358213 97.8743687,99.2340187 L97.8743687,99.2340187 Z" id="Combined-Shape"></path>
                <rect id="Rectangle" transform="translate(149.500000, 44.194174) rotate(-45.000000) translate(-149.500000, -44.194174) " x="135" y="-3.80582618" width="29" height="96"></rect>
                <polygon id="Polygon" transform="translate(122.916857, 69.909099) rotate(45.000000) translate(-122.916857, -69.909099) " points="122.916857 52.6185734 168.416857 52.409099 151.037404 87.409099 94.7963109 87.409099 77.4168574 52.409099"></polygon>
                <circle id="Oval" cx="27.75" cy="164.944174" r="27.75"></circle>
            </g>
            <rect id="Rectangle" transform="translate(162.530697, 22.848726) rotate(9.000000) translate(-162.530697, -22.848726) " x="158.530697" y="0.348725524" width="8" height="45" rx="4"></rect>
            <path d="M188.82359,10.0558323 C191.032729,10.0558323 192.82359,11.8466933 192.82359,14.0558323 L192.82359,53.0558323 C192.82359,55.2649713 191.032729,57.0558323 188.82359,57.0558323 C186.614451,57.0558323 184.82359,55.2649713 184.82359,53.0558323 L184.82359,25.3323417 L184.82359,25.3323417 L184.82359,14.0558323 C184.82359,11.8466933 186.614451,10.0558323 188.82359,10.0558323 Z" id="Rectangle" transform="translate(188.823590, 33.555832) rotate(45.000000) translate(-188.823590, -33.555832) "></path>
            <path d="M199.327317,37.616767 C201.536456,37.616767 203.327317,39.407628 203.327317,41.616767 L203.327317,79.616767 C203.327317,81.825906 201.536456,83.616767 199.327317,83.616767 C197.118178,83.616767 195.327317,81.825906 195.327317,79.616767 L195.327317,52.5682443 L195.327317,52.5682443 L195.327317,41.616767 C195.327317,39.407628 197.118178,37.616767 199.327317,37.616767 Z" id="Rectangle" transform="translate(199.327317, 60.616767) rotate(83.000000) translate(-199.327317, -60.616767) "></path>
        </g>
    </g>
</svg>`,
};

/**
 * Default button style
 */
export const defaultButtonStyle: ButtonStyle = {
  radius: 30,
  backgroundColor: '#ffffff',
  color: '#000000',
  padding: '10px',
  size: 24
};

/**
 * Default button configurations
 */
export const defaultButtons: ButtonsConfig = {
  capture: {
    icon: defaultIcons.captureIcon,
    style: {
      radius: 40,
      backgroundColor: '#ffffff',
      color: '#000000',
      padding: '12px',
      size: 32
    },
    position: 'center'
  },
  done: {
    icon: defaultIcons.doneIcon,
    style: {
      radius: 30,
      backgroundColor: '#28a745',
      color: '#ffffff',
      padding: '10px',
      size: 24
    }
  },
  cancel: {
    icon: defaultIcons.cancelIcon,
    style: {
      radius: 30,
      backgroundColor: '#dc3545',
      color: '#ffffff',
      padding: '10px',
      size: 24
    }
  },
  switchCamera: {
    icon: defaultIcons.switchCameraIcon,
    style: {
      radius: 30,
      backgroundColor: 'rgba(0,0,0,0.5)',
      color: '#ffffff',
      padding: '10px',
      size: 24
    },
    position: 'topRight'
  },
  torch: {
    offIcon: defaultIcons.torchOffIcon,
    onIcon: defaultIcons.torchOnIcon,
    style: {
      radius: 30,
      backgroundColor: 'rgba(0,0,0,0.5)',
      color: '#ffffff',
      padding: '10px',
      size: 24
    },
    position: 'topRight'
  },
  zoom: {
    icon: defaultIcons.zoomIcon,
    style: {
      radius: 30,
      backgroundColor: 'rgba(0,0,0,0.5)',
      color: '#ffffff',
      padding: '10px',
      size: 24
    },
    levels: [1, 2, 3, 4]
  },
  flash: {
    offIcon: defaultIcons.flashOffIcon,
    onIcon: defaultIcons.flashOnIcon,
    autoIcon: defaultIcons.flashAutoIcon,
    style: {
      radius: 30,
      backgroundColor: 'rgba(0,0,0,0.5)',
      color: '#ffffff',
      padding: '10px',
      size: 24
    },
    position: 'topLeft'
  }
};
