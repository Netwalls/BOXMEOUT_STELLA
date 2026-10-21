import React from 'react';
import { ComponentStory, ComponentMeta } from '@storybook/react';
import { Toast, ToastType } from './Toast';

export default {
  title: 'Components/Toast',
  component: Toast,
  parameters: {
    docs: {
      description: {
        component: 'Toast notification component with auto-dismiss and close button.',
      },
    },
  },
  argTypes: {
    toast: {
      control: 'object',
      description: 'Toast configuration object',
    },
    onDismiss: {
      action: 'dismissed',
      description: 'Callback when toast is dismissed',
    },
  },
} as ComponentMeta<typeof Toast>;

const Template: ComponentStory<typeof Toast> = (args) => <Toast {...args} />;

export const Success = Template.bind({});
Success.args = {
  toast: {
    id: 'success-1',
    type: 'success' as ToastType,
    title: 'Success',
    message: 'Your action was completed successfully!',
  },
};

export const Error = Template.bind({});
Error.args = {
  toast: {
    id: 'error-1',
    type: 'error' as ToastType,
    title: 'Error',
    message: 'Something went wrong. Please try again.',
  },
};

export const Info = Template.bind({});
Info.args = {
  toast: {
    id: 'info-1',
    type: 'info' as ToastType,
    title: 'Information',
    message: 'This is an informational message.',
  },
};

export const ErrorWithoutTitle = Template.bind({});
ErrorWithoutTitle.args = {
  toast: {
    id: 'error-2',
    type: 'error' as ToastType,
    message: 'Error occurred without title.',
  },
};
