import React from 'react';
import type { Meta, StoryObj } from '@storybook/react';
import { Toast, ToastType } from './Toast';

const meta: Meta<typeof Toast> = {
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
};

export default meta;
type Story = StoryObj<typeof Toast>;

export const Success: Story = {
  args: {
    toast: {
      id: 'success-1',
      type: 'success' as ToastType,
      title: 'Success',
      message: 'Your action was completed successfully!',
    },
    onDismiss: () => {},
  },
};

export const ErrorStory: Story = {
  args: {
    toast: {
      id: 'error-1',
      type: 'error' as ToastType,
      title: 'Error',
      message: 'Something went wrong. Please try again.',
    },
    onDismiss: () => {},
  },
};

export const Info: Story = {
  args: {
    toast: {
      id: 'info-1',
      type: 'info' as ToastType,
      title: 'Information',
      message: 'This is an informational message.',
    },
    onDismiss: () => {},
  },
};

export const ErrorWithoutTitle: Story = {
  args: {
    toast: {
      id: 'error-2',
      type: 'error' as ToastType,
      message: 'Error occurred without title.',
    },
    onDismiss: () => {},
  },
};
