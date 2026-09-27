import { Component } from 'react';

export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error('Dashboard section error:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{ 
          padding: this.props.isMobile ? 16 : 24, 
          background: '#1a0a0a', 
          border: '1px solid #7f1d1d', 
          borderRadius: 12, 
          marginBottom: 16,
          ...(this.props.style || {})
        }}>
          <div style={{ color: '#f87171', fontWeight: 600, marginBottom: 8, fontSize: 14 }}>
            ⚠️ {this.props.title || 'Section'} Error
          </div>
          <div style={{ fontSize: 12, color: '#94a3b8', marginBottom: 12 }}>
            {this.state.error?.message || 'Something went wrong'}
          </div>
          <button 
            onClick={() => this.setState({ hasError: false, error: null })}
            style={{ 
              padding: '6px 14px', borderRadius: 6, border: '1px solid #7f1d1d',
              background: '#7f1d1d20', color: '#f87171', cursor: 'pointer', fontSize: 12 
            }}
          >
            Retry
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
