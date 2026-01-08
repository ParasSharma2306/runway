export const requireAuth = (req, res, next) => {
  if (req.session && req.session.userId) {
    return next();
  }
  
  if (req.accepts('html')) {
    return res.redirect('/401');
  }

  return res.status(401).json({ error: 'Unauthorized: Please log in' });
};

export const requireRole = (roles = []) => {
  return (req, res, next) => {
    if (!req.session.role) {
      if (req.accepts('html')) return res.redirect('/401');
      return res.status(401).json({ error: 'Unauthorized' });
    }

    if (!roles.includes(req.session.role)) {
      if (req.accepts('html')) {
        return res.redirect('/403'); 
      }
      return res.status(403).json({ error: 'Forbidden: Insufficient permissions' });
    }
    
    next();
  };
};